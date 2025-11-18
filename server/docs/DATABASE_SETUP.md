# Database Production Setup Guide

프로덕션 환경에서 MongoDB와 Redis를 안전하고 효율적으로 운영하기 위한 상세 가이드입니다.

---

## MongoDB Atlas 프로덕션 설정

### 1. 인스턴스 생성 & 네트워크 보안

#### 클러스터 생성
```
□ MongoDB Atlas 계정 생성
□ M10 이상 클러스터 선택 (프로덕션)
  - M10: 2GB RAM, 10GB Storage (시작용)
  - M20: 4GB RAM, 20GB Storage (권장)
□ 리전 선택 (애플리케이션 서버와 같은 리전)
□ Replica Set 3개 노드 (기본)
```

#### Private Endpoint 설정 (권장 1순위)

**AWS PrivateLink 사용:**
```bash
# 1. Atlas 콘솔 → Network Access → Private Endpoint
# 2. AWS 리전 선택
# 3. VPC Endpoint Service 이름 복사

# 4. AWS Console에서 VPC Endpoint 생성
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxxxx \
  --service-name <atlas-service-name> \
  --subnet-ids subnet-xxxxx subnet-yyyyy

# 5. Atlas에서 Endpoint ID 등록
# 6. 연결 문자열 사용
mongodb+srv://pl-0-us-east-1.xxxxx.mongodb.net/
```

**장점:**
- Public IP 불필요
- VPC 내부 통신만
- AWS PrivateLink로 완전 격리

#### VPC Peering 설정 (권장 2순위)

```bash
# 1. Atlas → Network Access → Peering
# 2. AWS VPC ID 입력: vpc-xxxxx
# 3. CIDR 블록: 10.0.0.0/16
# 4. Atlas CIDR 확인: 192.168.248.0/21

# 5. AWS에서 Peering 수락
aws ec2 accept-vpc-peering-connection \
  --vpc-peering-connection-id pcx-xxxxx

# 6. 라우팅 테이블 업데이트
aws ec2 create-route \
  --route-table-id rtb-xxxxx \
  --destination-cidr-block 192.168.248.0/21 \
  --vpc-peering-connection-id pcx-xxxxx
```

**설정 후 확인:**
```
□ Public Access OFF (Atlas → Network Access)
□ IP Allowlist 제거 (0.0.0.0/0 삭제)
□ Private DNS 활성화
```

#### IP Allowlist (차선책)

**사용 시나리오:**
- VPC Peering/Private Endpoint 불가능한 환경
- 테스트/스테이징 환경

```bash
# NAT Gateway 고정 IP만 허용
Atlas → Network Access → IP Access List
→ Add IP Address: 203.0.113.1/32

# ⚠️ 절대 금지
0.0.0.0/0  # 전체 오픈
```

---

### 2. 인증 & 권한 설정

#### 애플리케이션 전용 사용자 생성

```javascript
// Atlas → Database Access → Add New Database User

Username: chat-app-prod
Password: <openssl rand -base64 32>
Database User Privileges:
  - Read and write to any database: NO
  - Custom Role:
    - Database: chatdb
    - Role: readWrite
```

**비밀번호 규칙:**
```
□ 최소 16자
□ 대소문자, 숫자, 특수문자 조합
□ 특수문자 포함 시 URL 인코딩 필수
```

**URL 인코딩 예시:**
```javascript
// Node.js
const password = 'p@ssw0rd!123';
const encoded = encodeURIComponent(password);
// 결과: p%40ssw0rd%21123

// 최종 URI
mongodb+srv://chat-app-prod:p%40ssw0rd%21123@cluster.mongodb.net/chatdb
```

---

### 3. 연결 문자열 & 옵션

#### SRV 레코드 사용 (권장)

```env
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/chatdb?retryWrites=true&w=majority
```

#### 연결 옵션 설정

```env
# 연결 풀
MONGO_POOL_SIZE=10

# 타임아웃
MONGO_CONNECT_TIMEOUT_MS=10000
MONGO_SOCKET_TIMEOUT_MS=45000

# TLS/SSL (Atlas 필수)
MONGO_USE_TLS=true

# 재시도
MONGO_RETRY_WRITES=true
MONGO_RETRY_READS=true
```

---

### 4. 백업 & 복구 전략

#### PITR (Point-in-Time Recovery) 활성화

```
Atlas → Backup → Cloud Backup
□ Enable Continuous Cloud Backup
□ Retention Policy:
  - Snapshots: 7일 보관
  - Point-in-Time: 최근 24시간
□ Backup Schedule:
  - Daily: 매일 03:00 UTC
  - Weekly: 일요일
  - Monthly: 매월 1일
```

#### 백업 검증

```bash
# 분기별 복구 테스트 (자세한 내용: RECOVERY_PLAYBOOK.md)
1. 테스트 클러스터로 복구
2. 데이터 무결성 확인
3. 애플리케이션 연결 테스트
4. 복구 시간 측정 (RTO 목표: 30분)
```

---

### 5. 인덱스 생성

#### 인덱스 스크립트 실행

```bash
# 배포 후 또는 스키마 변경 시 실행
npm run create-indexes

# 또는 직접 실행
npx ts-node scripts/create-indexes.ts
```

#### 인덱스 목록

| Collection | Index | Type | Purpose |
|-----------|-------|------|---------|
| users | username | unique | 사용자 조회 |
| messages | roomId + createdAt | compound | 룸별 메시지 조회 |
| messages | senderId + createdAt | compound | 발신자별 메시지 |
| rooms | participants | array | 참가자별 룸 검색 |
| refreshtokens | userId + isRevoked | compound | 유효 토큰 조회 |
| refreshtokens | jti | unique | 토큰 ID 검색 |
| refreshtokens | expiresAt | TTL | 자동 만료 |

#### 인덱스 사용률 모니터링

```javascript
// MongoDB Shell
db.messages.aggregate([
  { $indexStats: {} }
])

// 느린 쿼리 확인
db.setProfilingLevel(1, { slowms: 100 })
db.system.profile.find().sort({ ts: -1 }).limit(10)
```

---

### 6. 모니터링 & 알림

#### Atlas Performance Advisor

```
Atlas → Performance Advisor
□ Suggested Indexes 검토 (주간)
□ Slow Queries 분석
□ Query Performance 그래프 확인
```

#### 알림 설정

```
Atlas → Alerts
□ CPU Usage > 80%
□ Connections > 80% of max
□ Disk Usage > 80%
□ Replication Lag > 10 seconds
□ Backup Failure

알림 채널:
- Email: ops@company.com
- Slack: #alerts 채널
- PagerDuty: 심각한 문제만
```

---

## Redis 프로덕션 설정

### 1. 보안 설정

#### 비밀번호 설정

```bash
# redis.conf 또는 런타임
redis-cli CONFIG SET requirepass "$(openssl rand -base64 32)"

# 영구 설정 (redis.conf)
requirepass your-strong-password-here

# 연결 테스트
redis-cli -a your-password PING
# 응답: PONG
```

#### ACL (Access Control List) 설정 (Redis 6+)

```bash
# 앱 전용 사용자 생성
redis-cli ACL SETUSER appuser on >strong_password \
  +@all -@dangerous \
  ~* \
  allcommands

# 차단할 위험 명령
-FLUSHALL    # 전체 데이터 삭제
-FLUSHDB     # 현재 DB 삭제
-CONFIG      # 설정 변경
-SHUTDOWN    # 서버 종료
-KEYS        # 와일드카드 스캔 (성능 저하)
-SAVE        # 동기 저장 (블로킹)
-BGSAVE      # 백그라운드 저장
-DEBUG       # 디버그 명령

# 허용 명령 확인
redis-cli ACL GETUSER appuser
```

#### 네트워크 바인딩

```bash
# redis.conf
bind 127.0.0.1        # 로컬만
# 또는
bind 10.0.1.100       # VPC 내부 IP만

# Protected mode (외부 접근 차단)
protected-mode yes
```

---

### 2. 영속성 전략 (AOF + RDB)

#### AOF (Append Only File) 설정

```bash
# redis.conf
appendonly yes
appendfsync everysec           # 1초마다 디스크 동기화
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# 파일 위치
dir /var/lib/redis
appendfilename "appendonly.aof"
```

**Fsync 옵션:**
- `always`: 모든 쓰기 동기화 (느림, 안전함)
- `everysec`: 1초마다 동기화 (**권장**)
- `no`: OS에 맡김 (빠름, 위험)

#### RDB (스냅샷) 설정

```bash
# redis.conf
save 900 1      # 15분 동안 1개 이상 키 변경
save 300 10     # 5분 동안 10개 이상 키 변경
save 60 10000   # 1분 동안 10000개 이상 키 변경

# 스냅샷 파일
dbfilename dump.rdb
dir /var/lib/redis

# 압축 (CPU 사용 증가)
rdbcompression yes
```

#### 영속성 전략 비교

| 방식 | 복구 속도 | 데이터 손실 | 디스크 I/O | 권장 용도 |
|-----|----------|-----------|-----------|---------|
| AOF only | 느림 | 최소 (1초) | 높음 | 데이터 무결성 중요 |
| RDB only | 빠름 | 최대 (15분) | 낮음 | 캐시 용도 |
| AOF + RDB | 중간 | 최소 | 중간 | **프로덕션 권장** |

---

### 3. 메모리 관리

#### maxmemory 설정

```bash
# redis.conf
maxmemory 3gb                    # 시스템 메모리의 70-80%
maxmemory-policy allkeys-lru     # LRU 제거 정책
maxmemory-samples 5              # LRU 샘플 수
```

**Eviction 정책:**
- `noeviction`: 메모리 가득 시 쓰기 거부 (기본)
- `allkeys-lru`: 모든 키 중 LRU로 제거 (**권장**)
- `volatile-lru`: 만료 설정된 키만 LRU 제거
- `allkeys-lfu`: LFU (Least Frequently Used)
- `allkeys-random`: 랜덤 제거

#### 메모리 사용량 모니터링

```bash
# 현재 메모리 사용량
redis-cli INFO memory | grep used_memory_human

# 키별 메모리 사용량
redis-cli --bigkeys

# 메모리 조각화 확인
redis-cli INFO memory | grep mem_fragmentation_ratio
# 1.5 이상이면 문제
```

---

### 4. 성능 최적화

#### 연결 & 타임아웃

```bash
# redis.conf
timeout 300              # 유휴 연결 5분 후 종료
tcp-keepalive 300        # TCP keepalive
maxclients 10000         # 최대 동시 연결
```

#### 슬로우 로그

```bash
# redis.conf
slowlog-log-slower-than 10000   # 10ms 이상 쿼리 로깅
slowlog-max-len 128              # 최대 128개 저장

# 슬로우 로그 확인
redis-cli SLOWLOG GET 10
```

---

### 5. 모니터링 & 알림

#### redis_exporter 설정 (Prometheus)

```bash
# Docker Compose
redis_exporter:
  image: oliver006/redis_exporter:latest
  environment:
    - REDIS_ADDR=redis://redis:6379
    - REDIS_PASSWORD=your-password
  ports:
    - "9121:9121"
```

#### 알림 설정

```yaml
# Prometheus Alert Rules
groups:
  - name: redis
    rules:
      - alert: RedisDown
        expr: redis_up == 0
        for: 1m

      - alert: RedisHighMemory
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.8
        for: 5m

      - alert: RedisHighConnections
        expr: redis_connected_clients / redis_config_maxclients > 0.8

      - alert: RedisEvictedKeys
        expr: rate(redis_evicted_keys_total[5m]) > 0
```

---

## 비밀 관리 가이드

### 1. 환경변수 보안

#### .env 파일 관리

```bash
# ✅ 올바른 관리
1. .gitignore에 .env 추가
2. .env.example만 Git 커밋
3. 프로덕션 .env는 별도 보안 저장소

# ❌ 절대 금지
git add .env                    # .env 파일 커밋
echo "PASSWORD=..." >> script   # 비밀번호 하드코딩
console.log(process.env.MONGO_URI)  # 로그에 출력
```

#### CI/CD Secret 변수

**GitHub Actions:**
```yaml
# .github/workflows/deploy.yml
env:
  MONGO_URI: ${{ secrets.MONGO_URI }}
  REDIS_PASSWORD: ${{ secrets.REDIS_PASSWORD }}
```

**GitLab CI:**
```yaml
# .gitlab-ci.yml
variables:
  MONGO_URI: $MONGO_URI          # Protected variable
  REDIS_PASSWORD: $REDIS_PASSWORD
```

---

### 2. AWS Secrets Manager 통합

#### Secret 생성

```bash
# MongoDB URI
aws secretsmanager create-secret \
  --name chat-app/database \
  --description "Database credentials" \
  --secret-string '{
    "mongo_uri": "mongodb+srv://...",
    "redis_password": "..."
  }'

# JWT Secrets
aws secretsmanager create-secret \
  --name chat-app/jwt-secrets \
  --secret-string '{
    "current": "...",
    "previous": "..."
  }'
```

#### IAM 정책 (최소 권한)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:123456789012:secret:chat-app/*"
      ]
    }
  ]
}
```

#### 환경변수 설정

```env
USE_AWS_SECRETS=true
AWS_REGION=us-east-1
AWS_SECRET_NAME=chat-app/jwt-secrets
AWS_SECRETS_FAIL_OPEN=false  # 실패 시 부팅 차단
```

---

## 배포 전 체크리스트

```
### MongoDB
□ Atlas M10+ 클러스터 생성
□ VPC Peering 또는 Private Endpoint 설정
□ Public Access OFF
□ 앱 전용 사용자 생성 (readWrite 권한만)
□ 비밀번호 URL 인코딩 확인
□ PITR 백업 활성화
□ npm run create-indexes 실행
□ 알림 설정 (CPU, Disk, Connections)

### Redis
□ requirepass 설정 (32자 이상)
□ ACL 사용자 생성 (위험 명령 차단)
□ AOF everysec + RDB 설정
□ maxmemory 설정 (시스템의 70%)
□ eviction 정책: allkeys-lru
□ redis_exporter 설정
□ 알림 설정 (Memory, Evictions)

### 비밀 관리
□ .env 파일 Git 제외
□ 특수문자 URL 인코딩
□ AWS Secrets Manager 설정 (프로덕션)
□ CI/CD Secret 변수 등록

### 검증
□ EnvValidationService 통과
□ 연결 테스트 성공
□ 인덱스 생성 확인
□ 백업 작동 확인
```

---

## 참고 문서

- [RECOVERY_PLAYBOOK.md](./RECOVERY_PLAYBOOK.md) - 재해 복구 절차
- [OPERATIONAL_CHECKLIST.md](./OPERATIONAL_CHECKLIST.md) - 운영 점검 체크리스트
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Redis Documentation](https://redis.io/documentation)

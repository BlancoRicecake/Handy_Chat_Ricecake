# 재해 복구 플레이북 (Disaster Recovery Playbook)

시스템 장애 발생 시 신속한 복구를 위한 단계별 가이드입니다.

---

## 복구 목표 (SLA)

| 지표 | 목표 | 설명 |
|-----|------|------|
| **RTO** | 30분 | 복구 시간 목표 (Recovery Time Objective) |
| **RPO** | 5분 | 복구 시점 목표 (Recovery Point Objective) |

---

## MongoDB 복구 시나리오

### 시나리오 1: 최근 데이터 손실 (5분 이내)

**상황:** 잘못된 쿼리 실행, 데이터 손상

**복구 절차:**

```bash
# 1. Atlas 콘솔 접속 (2분)
https://cloud.mongodb.com/

# 2. PITR 복구 시작 (3분)
Clusters → [클러스터 선택] → Backup
→ Restore → Point in Time
→ 시간 선택: [5분 전]
→ Restore to: New cluster

# 3. 복구 대기 (10분)
상태: Restoring... → Running

# 4. 연결 문자열 확인 (1분)
mongodb+srv://temp-restore-xxxx.mongodb.net/

# 5. 임시 연결 테스트 (2분)
mongo "mongodb+srv://..." --username admin
> use chatdb
> db.users.countDocuments()

# 6. 애플리케이션 연결 문자열 업데이트 (3분)
# 방법 A: 환경변수 hot-swap
kubectl set env deployment/api MONGO_URI="mongodb+srv://temp-restore..."

# 방법 B: AWS Secrets Manager 업데이트
aws secretsmanager update-secret \
  --secret-id chat-app/database \
  --secret-string '{"mongo_uri":"mongodb+srv://temp-restore..."}'

# 7. 애플리케이션 재시작 (5분)
kubectl rollout restart deployment/api
# 또는
docker-compose restart api

# 8. 헬스체크 확인 (2분)
curl https://api.yourdomain.com/health
# 응답: {"ok":true,"ts":"..."}

# 9. 데이터 검증 (2분)
- 사용자 로그인 테스트
- 메시지 전송/수신 테스트
- WebSocket 연결 테스트
```

**총 예상 시간: 30분**

---

### 시나리오 2: 전체 클러스터 장애

**상황:** Atlas 리전 장애, 클러스터 전체 다운

**복구 절차:**

```bash
# 1. 새 클러스터 프로비저닝 (10분)
Atlas → Create New Cluster
→ 동일 설정 (M20, 3 nodes)
→ 다른 리전 선택 (DR)

# 2. 최신 백업으로 복구 (10분)
Old Cluster → Backup → Latest Snapshot
→ Restore to: [새 클러스터]

# 3. DNS/연결 문자열 전환 (5분)
# 위의 4-7 단계와 동일

# 4. 구 클러스터 정리 (나중에)
복구 확인 후 24시간 뒤 삭제
```

**총 예상 시간: 25-30분**

---

### 시나리오 3: 인덱스 손상

**상황:** 인덱스 손상으로 쿼리 성능 저하

**복구 절차:**

```bash
# 1. 문제 인덱스 확인
mongo "mongodb+srv://..."
> db.messages.getIndexes()

# 2. 손상된 인덱스 재생성
> db.messages.dropIndex("roomId_createdAt")
> db.messages.createIndex({roomId: 1, createdAt: -1}, {name: "roomId_createdAt"})

# 또는 스크립트 실행
npm run create-indexes
```

**총 예상 시간: 5분**

---

## Redis 복구 시나리오

### 시나리오 1: AOF 파일 손상

**상황:** AOF 파일 손상, Redis 시작 실패

**복구 절차:**

```bash
# 1. Redis 중지
sudo systemctl stop redis
# 또는
docker-compose stop redis

# 2. AOF 파일 체크 및 복구
redis-check-aof --fix /var/lib/redis/appendonly.aof

# 3. Redis 재시작
sudo systemctl start redis

# 4. 연결 테스트
redis-cli -a password PING
# 응답: PONG

# 5. 데이터 확인
redis-cli -a password DBSIZE
```

**총 예상 시간: 5분**

---

### 시나리오 2: Redis 완전 데이터 손실

**상황:** AOF와 RDB 모두 손실

**복구 절차:**

```bash
# 1. 최신 RDB 백업 복사 (백업이 있는 경우)
cp /backup/dump-2024-01-01.rdb /var/lib/redis/dump.rdb

# 2. Redis 시작
sudo systemctl start redis

# 3. 캐시 워밍업 (선택사항)
# 애플리케이션이 자동으로 캐시 재생성함

# 4. 모니터링
redis-cli INFO stats | grep instantaneous_ops_per_sec
```

**총 예상 시간: 10분**

**영향:**
- 캐시 미스율 증가 (일시적)
- DB 부하 증가 (워밍업 동안)

---

### 시나리오 3: Redis 메모리 부족

**상황:** Redis 메모리 가득 참, 쓰기 실패

**긴급 조치:**

```bash
# 1. 현재 메모리 사용량 확인
redis-cli INFO memory | grep used_memory_human

# 2. 임시 메모리 증가 (재시작 후 원복됨)
redis-cli CONFIG SET maxmemory 4gb

# 또는 일부 키 삭제 (임시)
redis-cli --scan --pattern "temp:*" | xargs redis-cli DEL

# 3. 장기 해결책
- Redis 인스턴스 업그레이드
- Eviction 정책 검토
- 불필요한 키 정리
```

**총 예상 시간: 5분**

---

## 애플리케이션 복구

### 시나리오 1: API 서버 다운

**복구 절차:**

```bash
# 1. 로그 확인
kubectl logs deployment/api --tail=100
# 또는
docker-compose logs api --tail=100

# 2. 헬스체크 실패 원인 파악
curl -v https://api.yourdomain.com/health

# 3. 재시작
kubectl rollout restart deployment/api
# 또는
docker-compose restart api

# 4. 모니터링
watch kubectl get pods
```

**총 예상 시간: 5-10분**

---

## 분기별 복구 리허설

### 목적
- 복구 절차 숙지
- 복구 시간 측정 (RTO 검증)
- 플레이북 개선

### 리허설 일정

| 분기 | 날짜 | 시나리오 | 담당자 |
|-----|------|---------|--------|
| Q1 | 3월 첫째 주 수요일 | MongoDB PITR | DevOps |
| Q2 | 6월 첫째 주 수요일 | Redis AOF 복구 | Backend |
| Q3 | 9월 첫째 주 수요일 | 전체 장애 | 전체 |
| Q4 | 12월 첫째 주 수요일 | DR 리전 전환 | DevOps |

---

### 리허설 체크리스트

#### 준비 (1주 전)

```
□ 리허설 일정 공지 (Slack #engineering)
□ 참여자 소집 (DevOps, Backend, QA)
□ 테스트 환경 준비
□ 백업 상태 확인
□ 모니터링 도구 점검
```

#### 실행 (당일)

```
시간표:
09:00 - 09:15  킥오프 미팅
09:15 - 09:30  백업 스냅샷 생성
09:30 - 10:00  복구 시나리오 실행
10:00 - 10:30  데이터 검증 & 성능 테스트
10:30 - 11:00  복구 완료 & 정리
11:00 - 11:30  회고 미팅
```

**실행 체크리스트:**
```
□ 09:00 - 백업 생성 시작
□ 09:15 - MongoDB PITR 복구 시작
□ 09:30 - 복구 완료, 연결 테스트
□ 09:45 - 애플리케이션 재시작
□ 10:00 - 헬스체크 통과
□ 10:15 - 사용자 기능 테스트
□ 10:30 - 성능 벤치마크 (쿼리 레이턴시)
□ 10:45 - 복구 시간 기록
□ 11:00 - 리허설 종료
```

#### 사후 작업 (1일 후)

```
□ 리허설 보고서 작성
  - 실제 복구 시간 (vs 목표 30분)
  - 문제점 및 개선사항
  - 플레이북 업데이트 필요 사항

□ 액션 아이템 생성 (Jira/GitHub Issues)

□ 플레이북 업데이트

□ 다음 리허설 일정 예약
```

---

## 긴급 연락처

### 온콜 담당자

| 역할 | 담당자 | 전화 | Slack |
|-----|--------|------|-------|
| DevOps Lead | [이름] | [전화] | @devops-lead |
| Backend Lead | [이름] | [전화] | @backend-lead |
| DBA | [이름] | [전화] | @dba |

### 외부 지원

| 서비스 | 지원 채널 | 우선순위 |
|--------|----------|---------|
| MongoDB Atlas | support@mongodb.com | High |
| AWS Support | AWS Console → Support | High |
| Hosting Provider | [링크] | Medium |

---

## 에스컬레이션 절차

```
1단계 (0-15분): 온콜 DevOps 담당자
  ↓ 해결 실패
2단계 (15-30분): DevOps Lead + Backend Lead
  ↓ 해결 실패
3단계 (30-60분): CTO + 외부 지원 요청
```

---

## 복구 후 체크리스트

```
□ 헬스체크 통과 (/health → 200 OK)
□ 데이터 무결성 확인 (사용자 수, 메시지 수)
□ 기능 테스트 통과 (로그인, 메시지 전송)
□ 성능 모니터링 (응답 시간, 오류율)
□ 알림 시스템 정상 작동
□ 로그 집계 정상
□ 백업 재개 확인
□ 사후 보고서 작성 (인시던트 리포트)
□ 개선사항 도출 (포스트모템)
```

---

## 참고 문서

- [DATABASE_SETUP.md](./DATABASE_SETUP.md) - 데이터베이스 설정 가이드
- [OPERATIONAL_CHECKLIST.md](./OPERATIONAL_CHECKLIST.md) - 운영 점검 체크리스트
- [MongoDB Atlas Backup](https://docs.atlas.mongodb.com/backup/)
- [Redis Persistence](https://redis.io/topics/persistence)

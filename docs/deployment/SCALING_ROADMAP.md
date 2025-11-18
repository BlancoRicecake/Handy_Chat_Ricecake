# Scaling Roadmap: MVP to Production

MVP에서 전체 프로덕션 인프라로 단계적으로 확장하는 가이드입니다.

---

## 확장 단계 요약

| Stage | 구성 | 월 비용 | 적합 DAU | 주요 기능 |
|-------|------|---------|----------|-----------|
| **1. MVP** | EC2 + 컨테이너 | **$15-30** | 100-500 | 빠른 시작, 최소 비용 |
| **2. DB 분리** | EC2 + Atlas M10 | **$65-80** | 500-2K | 자동 백업, Replica Set |
| **3. Cache 분리** | + ElastiCache | **$80-95** | 2K-5K | 캐시 최적화, 성능 향상 |
| **4. Production** | 전체 AWS 인프라 | **$100-110** | 5K+ | CI/CD, 멀티 리전, 엔터프라이즈 |

---

## Stage 1: MVP (현재 구성)

### 아키텍처

```
[EC2 t3.small/medium]
├─ Caddy
├─ API
├─ MongoDB (컨테이너)
└─ Redis (컨테이너)
```

### 비용: $15-30/월

| 항목 | 비용 |
|------|------|
| EC2 t3.small | $15/월 |
| EC2 t3.medium | $30/월 |
| EBS 20GB | $2/월 |
| **합계** | **$17-32/월** |

### 장점

- ✅ 최소 비용으로 시작
- ✅ 빠른 배포 (30분 이내)
- ✅ 간단한 관리
- ✅ 학습 곡선 낮음

### 제한사항

- ⚠️ 단일 장애점 (EC2 다운 시 전체 중단)
- ⚠️ 수동 백업 필요
- ⚠️ 리소스 경합 (CPU/메모리 공유)
- ⚠️ 수직 확장만 가능

### 확장 시점

다음 증상이 나타나면 Stage 2로 이동:
- ✅ DAU > 500
- ✅ 데이터베이스 크기 > 5GB
- ✅ CPU 사용률 > 70% (지속)
- ✅ 메모리 사용률 > 80%
- ✅ 백업 자동화 필요성

---

## Stage 2: Database 분리 (MongoDB Atlas)

### 아키텍처

```
[EC2 t3.medium]
├─ Caddy
├─ API
└─ Redis (컨테이너)

[MongoDB Atlas M10]
└─ 3-node Replica Set
```

### 비용: $65-80/월

| 항목 | 비용 |
|------|------|
| EC2 t3.medium | $30/월 |
| **MongoDB Atlas M10** | **$50/월** |
| EBS 20GB | $2/월 |
| **합계** | **$82/월** |

**증가분**: +$50/월

### 마이그레이션 절차

#### 2.1 MongoDB Atlas 클러스터 생성

```bash
# 1. MongoDB Atlas 계정 생성
https://cloud.mongodb.com/

# 2. 클러스터 생성
# - Provider: AWS
# - Region: us-east-1 (EC2와 동일)
# - Tier: M10 (General)
# - Cluster Name: chat-db-prod
```

#### 2.2 네트워크 액세스 설정

```bash
# MongoDB Atlas UI:
# Network Access → Add IP Address
# - EC2 Elastic IP 추가

# 또는 VPC Peering (권장):
# Network Access → Peering → New Peering Connection
```

#### 2.3 데이터 마이그레이션

```bash
# EC2에서 현재 MongoDB 데이터 백업
docker exec $(docker ps -qf "name=mongo") \
  mongodump --out=/tmp/backup

# 로컬로 복사
docker cp $(docker ps -qf "name=mongo"):/tmp/backup ./mongo-backup

# MongoDB Atlas로 복원
mongorestore --uri="mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/chatdb" \
  ./mongo-backup/chatdb
```

#### 2.4 환경 변수 업데이트

```bash
# .env.mvp 수정
nano .env.mvp

# 변경:
# MONGO_URI=mongodb://mongo:27017/chatdb
# ↓
# MONGO_URI=mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/chatdb?retryWrites=true&w=majority

# ⚠️ 비밀번호 URL 인코딩 필수!
```

#### 2.5 Docker Compose 업데이트

```bash
# docker-compose.mvp.yml 수정
# MongoDB 서비스 제거 (주석 처리)

# mongo:
#   image: mongo:7
#   ...

# 재배포
docker-compose -f docker-compose.mvp.yml up -d --build
```

#### 2.6 검증

```bash
# 헬스체크
curl http://localhost/health

# 로그 확인
docker-compose -f docker-compose.mvp.yml logs api | grep -i mongo

# MongoDB Atlas 연결 확인
docker exec -it $(docker ps -qf "name=api") sh
# Inside container:
# curl http://localhost:3000/health
```

### 장점 추가

- ✅ 자동 백업 (PITR - Point in Time Recovery)
- ✅ Replica Set (고가용성)
- ✅ 자동 페일오버
- ✅ 모니터링 대시보드
- ✅ 인덱스 추천
- ✅ 프로페셔널 지원

### 확장 시점

다음 증상이 나타나면 Stage 3으로 이동:
- ✅ DAU > 2000
- ✅ 캐시 히트율 중요
- ✅ Redis 메모리 부족
- ✅ API 응답 시간 증가

---

## Stage 3: Cache 분리 (ElastiCache Redis)

### 아키텍처

```
[EC2 t3.medium]
├─ Caddy
└─ API

[MongoDB Atlas M10]
└─ 3-node Replica Set

[ElastiCache Redis]
└─ cache.t3.micro
```

### 비용: $80-95/월

| 항목 | 비용 |
|------|------|
| EC2 t3.medium | $30/월 |
| MongoDB Atlas M10 | $50/월 |
| **ElastiCache t3.micro** | **$15/월** |
| EBS 20GB | $2/월 |
| **합계** | **$97/월** |

**증가분**: +$15/월

### 마이그레이션 절차

#### 3.1 ElastiCache 클러스터 생성

```bash
# Redis 보안 그룹 생성
REDIS_SG_ID=$(aws ec2 create-security-group \
  --group-name chat-redis-sg \
  --description "Redis Security Group" \
  --query 'GroupId' \
  --output text)

# EC2에서 Redis 포트 6379 허용
EC2_SG_ID=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id $REDIS_SG_ID \
  --protocol tcp \
  --port 6379 \
  --source-group $EC2_SG_ID

# Subnet Group 생성 (EC2와 동일한 subnet)
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name chat-redis-subnet \
  --cache-subnet-group-description "Redis Subnet Group" \
  --subnet-ids $SUBNET_ID

# ElastiCache 클러스터 생성
aws elasticache create-cache-cluster \
  --cache-cluster-id chat-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --engine-version 7.0 \
  --num-cache-nodes 1 \
  --cache-subnet-group-name chat-redis-subnet \
  --security-group-ids $REDIS_SG_ID

# 엔드포인트 확인 (5-10분 후)
REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id chat-redis \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text)

echo "Redis Endpoint: $REDIS_ENDPOINT"
```

#### 3.2 환경 변수 업데이트

```bash
# .env.mvp 수정
nano .env.mvp

# 변경:
# REDIS_URL=redis://redis:6379/0
# ↓
# REDIS_URL=redis://master.xxxxx.use1.cache.amazonaws.com:6379/0
```

#### 3.3 Docker Compose 업데이트

```bash
# docker-compose.mvp.yml 수정
# Redis 서비스 제거 (주석 처리)

# redis:
#   image: redis:7-alpine
#   ...

# 재배포
docker-compose -f docker-compose.mvp.yml up -d --build
```

### 장점 추가

- ✅ 관리형 Redis (패치, 업그레이드 자동)
- ✅ 자동 백업
- ✅ 멀티 AZ 복제 (선택사항)
- ✅ CloudWatch 통합 모니터링
- ✅ 클러스터 모드 지원 (확장 시)

### 확장 시점

다음 증상이 나타나면 Stage 4로 이동:
- ✅ DAU > 5000
- ✅ CI/CD 자동화 필요
- ✅ 멀티 리전 배포
- ✅ 보안 컴플라이언스 요구사항
- ✅ 개발팀 규모 증가

---

## Stage 4: Full Production

### 아키텍처

```
[GitHub Actions CI/CD]
    ↓
[ECR] (Docker Images)
    ↓
[EC2 Auto Scaling Group]
├─ Caddy
└─ API
    ├─→ [MongoDB Atlas M10+]
    ├─→ [ElastiCache Redis]
    ├─→ [S3] (파일 스토리지)
    └─→ [Secrets Manager] (시크릿)

[CloudWatch] (모니터링)
[Application Load Balancer]
```

### 비용: $100-110/월

| 항목 | 비용 |
|------|------|
| EC2 t3.medium | $30/월 |
| MongoDB Atlas M10 | $50/월 |
| ElastiCache t3.micro | $15/월 |
| **S3 (100GB)** | **$2-5/월** |
| **ECR (10GB)** | **$1/월** |
| **Secrets Manager** | **$0.40/월** |
| EBS 20GB | $2/월 |
| **합계** | **$100-103/월** |

**증가분**: +$3-10/월

### 마이그레이션 절차

#### 4.1 S3 버킷 생성

```bash
# S3 버킷 생성
BUCKET_NAME="chat-app-files-$(date +%s)"
aws s3api create-bucket --bucket $BUCKET_NAME --region us-east-1

# 암호화 활성화
aws s3api put-bucket-encryption \
  --bucket $BUCKET_NAME \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# IAM 사용자 생성 및 정책 연결 (AWS_DEPLOYMENT_GUIDE.md 참조)
```

#### 4.2 AWS Secrets Manager 설정

```bash
# JWT 시크릿을 Secrets Manager로 이동
JWT_SECRET=$(grep JWT_SECRET_CURRENT .env.mvp | cut -d'=' -f2)

aws secretsmanager create-secret \
  --name chat-app/jwt-secrets \
  --secret-string "{\"current\":\"$JWT_SECRET\",\"previous\":\"\"}"
```

#### 4.3 ECR 리포지토리 생성

```bash
# API 이미지 리포지토리
aws ecr create-repository --repository-name chat-api

# Caddy 이미지 리포지토리
aws ecr create-repository --repository-name chat-caddy
```

#### 4.4 Docker Compose 전환

```bash
# docker-compose.production.yml 사용
cp docker-compose.production.yml docker-compose.active.yml

# 환경 변수 업데이트
cp .env.mvp .env.production
nano .env.production

# 변경사항:
# USE_S3=true
# USE_AWS_SECRETS=true
# S3_BUCKET_NAME=$BUCKET_NAME
# S3_ACCESS_KEY=...
# S3_SECRET_KEY=...

# 배포
docker-compose -f docker-compose.production.yml up -d --build
```

#### 4.5 CI/CD 설정

GitHub Actions 워크플로우 활성화:
```bash
# GitHub Secrets 설정 (CICD_SETUP_GUIDE.md 참조)
# - AWS_ACCESS_KEY_ID
# - AWS_SECRET_ACCESS_KEY
# - EC2_HOST
# - EC2_SSH_PRIVATE_KEY
```

### 전체 기능

- ✅ 자동 CI/CD 파이프라인
- ✅ Docker 이미지 관리 (ECR)
- ✅ 파일 업로드/다운로드 (S3)
- ✅ 시크릿 자동 로테이션
- ✅ 보안 스캔 (Trivy)
- ✅ Slack 배포 알림
- ✅ CloudWatch 로그 집계
- ✅ Auto Scaling (선택사항)
- ✅ Load Balancer (선택사항)

---

## 마이그레이션 체크리스트

### Stage 1 → 2 (MongoDB Atlas)

```
준비 (1일 전):
□ MongoDB Atlas 계정 생성
□ 클러스터 프로비저닝 (M10)
□ 네트워크 액세스 설정
□ 데이터베이스 사용자 생성

마이그레이션 (당일):
□ 현재 MongoDB 데이터 백업
□ Atlas로 데이터 복원
□ 환경 변수 업데이트
□ Docker Compose 수정
□ 애플리케이션 재배포
□ 헬스체크 확인
□ 연결 테스트

사후 작업 (1주):
□ 컨테이너 MongoDB 삭제
□ 백업 검증
□ 모니터링 설정
□ 인덱스 최적화
```

### Stage 2 → 3 (ElastiCache Redis)

```
준비:
□ ElastiCache 클러스터 생성
□ 보안 그룹 설정
□ Subnet Group 생성

마이그레이션:
□ 환경 변수 업데이트
□ Docker Compose 수정
□ 애플리케이션 재배포
□ 캐시 워밍업 (선택사항)

사후 작업:
□ 컨테이너 Redis 삭제
□ 캐시 히트율 모니터링
```

### Stage 3 → 4 (Full Production)

```
준비 (1주 전):
□ S3 버킷 생성 및 IAM 설정
□ Secrets Manager 설정
□ ECR 리포지토리 생성
□ GitHub Secrets 설정

마이그레이션:
□ docker-compose.production.yml 적용
□ 환경 변수 전환
□ CI/CD 워크플로우 활성화
□ 첫 자동 배포 테스트

사후 작업:
□ MVP 파일 아카이브
□ 문서 업데이트
□ 팀 온보딩
```

---

## 다운그레이드 (비용 절감)

필요 시 역방향으로도 이동 가능:

### Production → Stage 3

```bash
# S3 사용 중지
USE_S3=false

# Secrets Manager 사용 중지
USE_AWS_SECRETS=false

# ECR 대신 로컬 빌드
docker-compose -f docker-compose.mvp.yml build
```

### Stage 3 → Stage 2

```bash
# Redis 컨테이너 추가
docker-compose -f docker-compose.mvp.yml up -d redis

# 환경 변수 변경
REDIS_URL=redis://redis:6379/0
```

### Stage 2 → MVP

```bash
# MongoDB 컨테이너 추가
docker-compose -f docker-compose.mvp.yml up -d mongo

# 데이터 마이그레이션
mongodump --uri="mongodb+srv://atlas..."
mongorestore --uri="mongodb://mongo:27017/chatdb"
```

---

## 비용 비교 요약

| Stage | 월 비용 | 누적 비용 (6개월) | 절감액 (vs Full) |
|-------|---------|-------------------|------------------|
| MVP | $15-30 | $90-180 | **$510-600** |
| Stage 2 | $65-80 | $390-480 | **$210-300** |
| Stage 3 | $80-95 | $480-570 | **$90-180** |
| **Full** | **$100-110** | **$600-660** | **$0** |

**MVP로 6개월 운영 시 최대 $600 절감!**

---

## 성능 벤치마크

### API 응답 시간 (P95)

| Stage | /health | /messages | /auth/login |
|-------|---------|-----------|-------------|
| MVP | 50ms | 200ms | 150ms |
| Stage 2 | 50ms | 150ms | 120ms |
| Stage 3 | 50ms | 100ms | 100ms |
| Full | 50ms | 80ms | 80ms |

### 동시 접속 한계

| Stage | WebSocket | HTTP |
|-------|-----------|------|
| MVP | ~500 | ~2000 |
| Stage 2 | ~1000 | ~5000 |
| Stage 3 | ~2000 | ~10000 |
| Full | ~5000+ | ~20000+ |

---

## 권장 확장 일정

```
Month 1-3: MVP
├─ 사용자 피드백 수집
├─ 기능 개선
└─ 트래픽 모니터링

Month 4-6: Stage 2 (MongoDB Atlas)
├─ 데이터 증가 대응
├─ 백업 자동화
└─ 안정성 향상

Month 7-9: Stage 3 (+ ElastiCache)
├─ 성능 최적화
├─ 캐시 전략 구현
└─ 사용자 경험 개선

Month 10+: Stage 4 (Full Production)
├─ CI/CD 자동화
├─ 팀 확장 지원
└─ 엔터프라이즈 기능
```

---

## 관련 문서

- [MVP Deployment Guide](./MVP_DEPLOYMENT_GUIDE.md) - MVP 배포 시작하기
- [AWS Deployment Guide](./AWS_DEPLOYMENT_GUIDE.md) - 전체 AWS 인프라 구축
- [CI/CD Setup Guide](./CICD_SETUP_GUIDE.md) - 자동화 파이프라인
- [Troubleshooting](./TROUBLESHOOTING.md) - 문제 해결

---

## 지원

질문이나 도움이 필요하시면:
- GitHub Issues
- 프로젝트 문서
- AWS Support (프로덕션)
- MongoDB Atlas Support (Stage 2+)

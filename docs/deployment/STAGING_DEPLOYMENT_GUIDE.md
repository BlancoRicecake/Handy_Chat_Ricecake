# 채팅 스테이징 서버 배포 가이드

## 인프라 개요

| 항목 | 값 |
|------|-----|
| 인스턴스 | EC2 Spot `t4g.small` (ARM/Graviton) |
| 인스턴스 ID | `i-07f8a701645d39293` |
| Elastic IP | `54.180.52.81` (`eipalloc-09a27589f1a55aa82`) |
| OS | Amazon Linux 2023 |
| 디스크 | 20GB EBS (`/dev/nvme0n1p1`) |
| 메모리 | 2GB RAM + 2GB Swap |
| 리전 | ap-northeast-2 |
| VPC | vpc-0bd03d7d4bba7d60b |
| Spot 중단 시 | Stop (EBS 데이터 보존) |

## 접속 방법

```bash
# SSH 접속
ssh -i ~/handy-key.pem ec2-user@54.180.52.81

# Spot 인스턴스 시작/중지
aws ec2 start-instances --instance-ids i-07f8a701645d39293
aws ec2 stop-instances --instance-ids i-07f8a701645d39293
```

## 서버 구성

```
/opt/chat-staging/
├── .env.staging                        # 환경변수 (gitignored)
├── docker-compose.local-staging.yml    # ★ 스테이징 전용 Compose 파일
├── docker-compose.yml                  # 기본 (사용하지 않음)
├── caddy/
│   ├── Dockerfile                      # Caddy 2 Alpine 기반
│   └── Caddyfile                       # 리버스 프록시 설정
├── server/
│   ├── Dockerfile                      # Multi-stage Node 20 Alpine 빌드
│   ├── src/
│   └── scripts/
│       └── deploy-staging.sh           # 자동 배포 스크립트
└── .github/workflows/
    └── cd-staging.yml                  # GitHub Actions 수동 배포
```

### 컨테이너 구성 (4개)

| 서비스 | 이미지 | 포트 | 리소스 제한 |
|--------|--------|------|-------------|
| caddy | caddy:2-alpine (커스텀) | 80, 443 → api:3000 | 0.25 CPU, 128MB |
| api | node:20-alpine (빌드) | 3000 (내부) | 1.0 CPU, 512MB |
| mongo | mongo:7 | 27017 (내부) | 0.5 CPU, 384MB |
| redis | redis:7-alpine | 6379 (내부) | 0.25 CPU, 256MB |

### 요청 흐름

```
Client → :80/:443 → Caddy (리버스 프록시) → api:3000 (NestJS)
                                               ├── MongoDB (chatdb_stage)
                                               └── Redis
```

## 환경변수 (.env.staging)

```bash
# 서버
NODE_ENV=staging
PORT=3000

# DB
MONGO_URI=mongodb://mongo:27017/chatdb_stage

# Redis
REDIS_URL=redis://redis:6379/0

# JWT (★ 앱 스테이지 서버와 반드시 동일해야 함)
JWT_SECRET_CURRENT=StgHndy2025!Rlwy$$Tm#Dev@Env&Jwt*Secret^Key%Auth
# ⚠️  Docker Compose는 $를 변수로 해석함 → 리터럴 $는 $$로 이스케이프

# CORS
CORS_ORIGIN=http://localhost:3000,...,https://stage-handy.com,https://www.stage-handy.com

# 로깅
LOG_LEVEL=debug
```

### Docker Compose `$` 이스케이프 규칙

Docker Compose의 `env_file`은 `$VAR`을 환경변수 치환으로 처리한다:

| `.env.staging` 파일 | 컨테이너 내부 실제 값 |
|---------------------|----------------------|
| `$$Tm` | `$Tm` (리터럴 달러) |
| `$Tm` | `` (빈 문자열 — Tm 변수 없으면) |

**JWT 시크릿에 `$` 문자가 포함된 경우, 반드시 `$$`로 작성해야 한다.**

검증:
```bash
# 컨테이너 내부 실제 값 확인
docker compose -f docker-compose.local-staging.yml exec api printenv JWT_SECRET_CURRENT
```

## 배포 방법

### 방법 1: 자동 배포 스크립트 (권장)

```bash
ssh -i ~/handy-key.pem ec2-user@54.180.52.81

cd /opt/chat-staging
./server/scripts/deploy-staging.sh
```

스크립트 동작:
1. prerequisites 체크 (Docker, env 파일)
2. `git pull origin develop`
3. MongoDB 데이터 + env 파일 백업
4. `docker compose up -d --build`
5. Health check 대기
6. Docker image prune

옵션:
- `--no-pull`: git pull 생략 (코드 수동 수정 후 배포 시)
- `--no-backup`: 백업 생략

### 방법 2: GitHub Actions (수동 트리거)

GitHub → Actions → "CD (Staging Deployment)" → Run workflow

내부 동작: SSH로 서버 접속 → `deploy-staging.sh` 실행

필요한 Secrets:
- `STAGING_EC2_HOST`: `54.180.52.81`
- `EC2_SSH_PRIVATE_KEY`: SSH 프라이빗 키

### 방법 3: 수동 배포

```bash
ssh -i ~/handy-key.pem ec2-user@54.180.52.81
cd /opt/chat-staging

# 1. 코드 업데이트
git pull origin develop

# 2. 빌드 및 배포 (★ 반드시 local-staging.yml 사용)
docker compose -f docker-compose.local-staging.yml up -d --build

# 3. Health check
curl http://localhost/health
```

## 자주 쓰는 운영 명령어

```bash
# ─── 컨테이너 관리 ───
# 상태 확인
docker compose -f docker-compose.local-staging.yml ps

# 로그 확인
docker compose -f docker-compose.local-staging.yml logs -f api
docker compose -f docker-compose.local-staging.yml logs --tail=50 api

# API만 재시작 (코드 변경 없이 env만 변경 시)
# ⚠️  restart는 env 변경을 반영하지 않음!
docker compose -f docker-compose.local-staging.yml up -d --force-recreate api

# 전체 재시작
docker compose -f docker-compose.local-staging.yml down
docker compose -f docker-compose.local-staging.yml up -d

# ─── 환경변수 ───
# 컨테이너 내부 env 확인
docker compose -f docker-compose.local-staging.yml exec api printenv | sort

# ─── 리소스 ───
docker stats --no-stream
df -h
free -h

# ─── DB ───
# MongoDB 접속
docker compose -f docker-compose.local-staging.yml exec mongo mongosh chatdb_stage

# Redis 접속
docker compose -f docker-compose.local-staging.yml exec redis redis-cli
```

## 연동 서비스

| 서비스 | URL | 비고 |
|--------|-----|------|
| 앱 스테이지 프론트엔드 | https://stage-handy.com | Vercel |
| 앱 스테이지 API | https://api.stage-handy.com | 별도 EC2 |
| 채팅 스테이징 | http://54.180.52.81 | 이 서버 |

### JWT 연동

- 앱 스테이지 서버(`api.stage-handy.com`)가 JWT 발급
- 채팅 서버는 JWT 검증만 수행 (토큰 발급하지 않음)
- 양쪽의 `JWT_SECRET`이 반드시 동일해야 인증 성공
- 로그인 테스트: `POST https://api.stage-handy.com/api/auth/login`

```bash
# JWT 발급 테스트
TOKEN=$(curl -s -X POST https://api.stage-handy.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"seller@handy.com","password":"password123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 채팅 서버 인증 테스트
curl -s http://54.180.52.81/auth/me -H "Authorization: Bearer $TOKEN"
curl -s http://54.180.52.81/rooms -H "Authorization: Bearer $TOKEN"
```

## 주의사항

1. **Docker Compose 파일**: 반드시 `-f docker-compose.local-staging.yml` 사용. 기본 `docker-compose.yml`은 `server/.env`를 참조하여 동작하지 않음.

2. **`docker compose restart`는 env를 다시 읽지 않음**: `.env.staging` 수정 후에는 `up -d --force-recreate api` 사용.

3. **`$` 이스케이프**: `.env.staging`에서 리터럴 `$`는 `$$`로 작성. `docker compose up` 시 `"Tm" variable is not set` 경고가 나오면 이스케이프 누락.

4. **Spot 인스턴스**: AWS가 용량 회수 시 자동 Stop됨. 재시작하면 EBS 데이터는 보존되나, 컨테이너 재시작 필요:
   ```bash
   aws ec2 start-instances --instance-ids i-07f8a701645d39293
   # 인스턴스 시작 후
   ssh -i ~/handy-key.pem ec2-user@54.180.52.81
   cd /opt/chat-staging && docker compose -f docker-compose.local-staging.yml up -d
   ```

5. **Git 브랜치**: 서버에 `develop` 브랜치가 체크아웃되어 있음. 배포 스크립트는 `git pull origin develop` 수행.

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| JWT "Invalid token" 401 | JWT 시크릿 불일치 | `printenv JWT_SECRET_CURRENT` 확인 → 앱 서버와 비교 |
| `"Tm" variable is not set` 경고 | `.env`의 `$` 미이스케이프 | `$Tm` → `$$Tm` 으로 수정 |
| `env file server/.env not found` | 잘못된 compose 파일 사용 | `-f docker-compose.local-staging.yml` 확인 |
| env 변경 후 반영 안 됨 | `restart`는 env 미반영 | `up -d --force-recreate api` 사용 |
| 컨테이너 빌드 실패 | 메모리 부족 | swap 확인: `swapon --show`, 없으면 2GB swap 생성 |
| Spot 인스턴스 접속 불가 | AWS 용량 회수로 Stop | `aws ec2 start-instances` 후 재접속 |

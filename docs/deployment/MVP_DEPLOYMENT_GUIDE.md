# MVP Deployment Guide

**목표 비용: $15-30/월**

EC2 1대에 모든 서비스를 Docker Compose로 구성하여 최소 비용으로 시작하는 MVP 배포 가이드입니다.

---

## 아키텍처

```
[EC2 t3.small/t3.medium - $15-30/월]
├─ Caddy (리버스 프록시 + HTTPS)
├─ API (NestJS)
├─ MongoDB (컨테이너)
└─ Redis (컨테이너)

배포: 수동 (git pull + docker compose)
스토리지: S3 비활성화
시크릿: .env.mvp 파일
```

---

## 비용 비교

| 구성 | 월 비용 |
|------|---------|
| **MVP (이 가이드)** | **$15-30** |
| Production (전체 AWS 인프라) | $100-110 |
| **절감액** | **$70-90 (70-85%)** |

---

## Step 1: AWS EC2 인스턴스 생성

### 1.1 인스턴스 사양

```
Instance Type: t3.small (2 vCPU, 2GB RAM) 또는 t3.medium (2 vCPU, 4GB RAM)
AMI: Ubuntu 22.04 LTS
Storage: 20GB gp3
Region: us-east-1 (또는 원하는 리전)
```

**예약 인스턴스 추천**:
- 1년 예약: 30-40% 절감
- 3년 예약: 50-60% 절감

### 1.2 AWS CLI로 인스턴스 생성

```bash
# 키 페어 생성
aws ec2 create-key-pair \
  --key-name mvp-chat-key \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/mvp-chat-key.pem

chmod 400 ~/.ssh/mvp-chat-key.pem

# 보안 그룹 생성
SG_ID=$(aws ec2 create-security-group \
  --group-name mvp-chat-sg \
  --description "MVP Chat App Security Group" \
  --query 'GroupId' \
  --output text)

# HTTP/HTTPS 허용
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0

# SSH 허용 (내 IP만)
MY_IP=$(curl -s ifconfig.me)
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr $MY_IP/32

# Ubuntu 22.04 AMI ID 찾기
AMI_ID=$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text)

# 인스턴스 시작
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t3.small \
  --key-name mvp-chat-key \
  --security-group-ids $SG_ID \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":20,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=mvp-chat-app}]' \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Instance ID: $INSTANCE_ID"

# 인스턴스 시작 대기
aws ec2 wait instance-running --instance-ids $INSTANCE_ID

# Public IP 확인
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo "Public IP: $PUBLIC_IP"
```

### 1.3 Elastic IP 할당 (권장)

```bash
# Elastic IP 할당
ALLOC_ID=$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)

# 인스턴스에 연결
aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id $ALLOC_ID

# Elastic IP 확인
ELASTIC_IP=$(aws ec2 describe-addresses --allocation-ids $ALLOC_ID --query 'Addresses[0].PublicIp' --output text)

echo "Elastic IP: $ELASTIC_IP"
```

---

## Step 2: EC2 초기 설정

### 2.1 SSH 접속

```bash
ssh -i ~/.ssh/mvp-chat-key.pem ubuntu@$ELASTIC_IP
```

### 2.2 Docker 설치

```bash
# 시스템 업데이트
sudo apt-get update
sudo apt-get upgrade -y

# Docker 설치
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 사용자를 docker 그룹에 추가
sudo usermod -aG docker ubuntu

# 로그아웃 후 재접속 (그룹 변경 적용)
exit
ssh -i ~/.ssh/mvp-chat-key.pem ubuntu@$ELASTIC_IP
```

### 2.3 Docker Compose 설치

```bash
# Docker Compose 설치
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

sudo chmod +x /usr/local/bin/docker-compose

# 확인
docker --version
docker-compose --version
```

### 2.4 추가 도구 설치

```bash
sudo apt-get install -y git curl wget jq
```

---

## Step 3: 프로젝트 설정

### 3.1 프로젝트 클론

```bash
# 애플리케이션 디렉토리 생성
sudo mkdir -p /opt/chat-app
sudo chown ubuntu:ubuntu /opt/chat-app
cd /opt/chat-app

# Git 클론
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git .

# 또는 로컬에서 파일 업로드
# scp -i ~/.ssh/mvp-chat-key.pem -r /path/to/project/* ubuntu@$ELASTIC_IP:/opt/chat-app/
```

### 3.2 환경 변수 설정

```bash
# .env.mvp 파일 생성
cp .env.mvp.example .env.mvp

# JWT 시크릿 생성
JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
echo "Generated JWT Secret: $JWT_SECRET"

# .env.mvp 편집
nano .env.mvp

# 변경할 항목:
# 1. JWT_SECRET_CURRENT=<생성된 시크릿>
# 2. CORS_ORIGIN=https://yourdomain.com
# 3. (선택) MongoDB 인증 활성화

# 파일 권한 설정
chmod 600 .env.mvp
```

---

## Step 4: 도메인 설정

### 4.1 DNS 레코드 추가

**Route 53 사용:**
```bash
# Hosted Zone ID 확인
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name=='yourdomain.com.'].Id" --output text | cut -d'/' -f3)

# A 레코드 생성
cat > change-batch.json << EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "yourdomain.com",
      "Type": "A",
      "TTL": 300,
      "ResourceRecords": [{"Value": "$ELASTIC_IP"}]
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://change-batch.json
```

**외부 DNS 제공자:**
1. DNS 제공자 웹사이트 접속
2. A 레코드 추가:
   - Host: @ 또는 yourdomain.com
   - Value: Elastic IP
   - TTL: 300

### 4.2 Caddyfile 업데이트

```bash
cd /opt/chat-app

# Caddyfile 편집
nano caddy/Caddyfile

# 도메인으로 변경:
# Before:
# :80, :443 {
#   ...
# }

# After:
# yourdomain.com {
#   reverse_proxy api:3000
#   ...
# }

# 저장 및 종료 (Ctrl+X, Y, Enter)
```

---

## Step 5: MongoDB 인덱스 생성

```bash
# Node.js 설치 (임시, 인덱스 생성용)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 서버 디렉토리로 이동
cd /opt/chat-app/server

# 의존성 설치
npm ci

# MongoDB 컨테이너 시작 (잠시만)
cd /opt/chat-app
docker-compose -f docker-compose.mvp.yml up -d mongo

# MongoDB 시작 대기
sleep 10

# 인덱스 생성
cd /opt/chat-app/server
npx ts-node scripts/create-indexes.ts

# Node.js 제거 (선택사항, 공간 절약)
# sudo apt-get remove -y nodejs
```

---

## Step 6: 애플리케이션 배포

### 6.1 첫 배포

```bash
cd /opt/chat-app

# 배포 스크립트 실행 권한 부여
chmod +x server/scripts/deploy-mvp.sh

# 첫 배포 (백업 없이)
./server/scripts/deploy-mvp.sh --no-pull --no-backup

# 또는 수동 배포:
docker-compose -f docker-compose.mvp.yml up -d --build
```

### 6.2 배포 확인

```bash
# 컨테이너 상태 확인
docker-compose -f docker-compose.mvp.yml ps

# 로그 확인
docker-compose -f docker-compose.mvp.yml logs -f

# 헬스체크
curl http://localhost/health
# 예상 응답: {"ok":true,"ts":"2024-01-15T..."}
```

### 6.3 외부 접속 테스트

```bash
# 로컬 머신에서
curl https://yourdomain.com/health

# HTTPS 인증서 확인 (Let's Encrypt)
curl -v https://yourdomain.com 2>&1 | grep "SSL certificate"
```

---

## Step 7: 자동 백업 설정

### 7.1 백업 스크립트 생성

```bash
cat > /opt/chat-app/backup.sh << 'EOF'
#!/bin/bash
set -e

BACKUP_DIR=/opt/chat-app/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# MongoDB 백업
docker exec $(docker ps -qf "name=mongo") \
  mongodump --quiet --out=/tmp/backup_$TIMESTAMP

docker cp $(docker ps -qf "name=mongo"):/tmp/backup_$TIMESTAMP \
  $BACKUP_DIR/mongo_$TIMESTAMP

# 환경 변수 백업
cp /opt/chat-app/.env.mvp $BACKUP_DIR/.env.mvp.$TIMESTAMP

# 7일 이상 된 백업 삭제
find $BACKUP_DIR -name "mongo_*" -mtime +7 -exec rm -rf {} \; 2>/dev/null || true
find $BACKUP_DIR -name ".env.mvp.*" -mtime +7 -delete 2>/dev/null || true

echo "Backup completed: $TIMESTAMP"
EOF

chmod +x /opt/chat-app/backup.sh
```

### 7.2 Cron Job 설정

```bash
# Crontab 편집
crontab -e

# 매일 새벽 2시에 백업 실행
0 2 * * * /opt/chat-app/backup.sh >> /opt/chat-app/logs/backup.log 2>&1
```

---

## Step 8: 모니터링 설정

### 8.1 간단한 모니터링 스크립트

```bash
cat > /opt/chat-app/monitor.sh << 'EOF'
#!/bin/bash

echo "=== System Resources ==="
echo "Disk Usage:"
df -h /

echo ""
echo "Memory Usage:"
free -h

echo ""
echo "=== Docker Containers ==="
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

echo ""
echo "=== Application Health ==="
curl -sf http://localhost/health && echo "✅ Healthy" || echo "❌ Unhealthy"
EOF

chmod +x /opt/chat-app/monitor.sh
```

### 8.2 알람 설정 (선택사항)

```bash
# 디스크 사용률 80% 초과 시 이메일 발송
cat > /opt/chat-app/disk-alert.sh << 'EOF'
#!/bin/bash
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')

if [ $DISK_USAGE -gt 80 ]; then
  echo "WARNING: Disk usage is ${DISK_USAGE}%" | \
    mail -s "Disk Alert: MVP Chat App" your@email.com
fi
EOF

chmod +x /opt/chat-app/disk-alert.sh

# Cron에 추가 (1시간마다)
# 0 * * * * /opt/chat-app/disk-alert.sh
```

---

## 일상적인 운영

### 배포 (코드 업데이트)

```bash
# SSH 접속
ssh -i ~/.ssh/mvp-chat-key.pem ubuntu@$ELASTIC_IP

# 배포 실행
cd /opt/chat-app
./server/scripts/deploy-mvp.sh

# 또는 수동:
git pull origin main
docker-compose -f docker-compose.mvp.yml up -d --build
```

### 로그 확인

```bash
# 모든 서비스 로그
docker-compose -f docker-compose.mvp.yml logs -f

# API 로그만
docker-compose -f docker-compose.mvp.yml logs -f api

# 최근 100줄
docker-compose -f docker-compose.mvp.yml logs --tail=100 api
```

### 리소스 모니터링

```bash
# 컨테이너 리소스 사용률
docker stats

# 시스템 리소스
htop  # 또는 top

# 디스크 사용률
df -h
```

### 서비스 재시작

```bash
# 모든 서비스
docker-compose -f docker-compose.mvp.yml restart

# 특정 서비스만
docker-compose -f docker-compose.mvp.yml restart api
```

---

## 문제 해결

### 컨테이너가 시작되지 않을 때

```bash
# 로그 확인
docker-compose -f docker-compose.mvp.yml logs

# 환경 변수 확인
cat .env.mvp

# 수동으로 컨테이너 시작 시도
docker-compose -f docker-compose.mvp.yml up api
```

### 디스크 공간 부족

```bash
# Docker 정리
docker system prune -a -f

# 오래된 로그 삭제
find /var/lib/docker/containers -name "*.log" -mtime +7 -delete

# 백업 정리
find /opt/chat-app/backups -mtime +7 -delete
```

### MongoDB 연결 실패

```bash
# MongoDB 컨테이너 확인
docker ps | grep mongo

# MongoDB 로그 확인
docker-compose -f docker-compose.mvp.yml logs mongo

# MongoDB 재시작
docker-compose -f docker-compose.mvp.yml restart mongo
```

---

## 확장 시점

다음 상황에서 확장을 고려하세요:

### Stage 2로 업그레이드 (MongoDB Atlas)
- ✅ DAU > 500
- ✅ 데이터베이스 크기 > 5GB
- ✅ 자동 백업 필요
- ✅ Replica Set 필요

### Stage 3로 업그레이드 (+ ElastiCache)
- ✅ DAU > 2000
- ✅ 캐시 히트율 중요
- ✅ Redis Cluster 필요

### Stage 4로 업그레이드 (전체 프로덕션)
- ✅ DAU > 5000
- ✅ CI/CD 자동화 필요
- ✅ 다중 리전 필요
- ✅ 엔터프라이즈 요구사항

**상세 내용**: [SCALING_ROADMAP.md](./SCALING_ROADMAP.md)

---

## 비용 최적화 팁

1. **Reserved Instance 사용**
   - 1년 예약: 30-40% 절감
   - 3년 예약: 50-60% 절감

2. **Spot Instance 고려** (비프로덕션 환경)
   - 최대 90% 절감
   - 중단 가능성 있음

3. **EBS 스냅샷 라이프사이클**
   - 오래된 스냅샷 자동 삭제
   - 월 $1-2 절감

4. **트래픽 최적화**
   - Caddy 압축 활성화
   - 불필요한 API 호출 제거

---

## 보안 체크리스트

- ✅ SSH 포트 22는 특정 IP만 허용
- ✅ JWT 시크릿 강력한 랜덤 값으로 설정
- ✅ .env.mvp 파일 권한 600 (chmod 600)
- ✅ .env.mvp 절대 Git에 커밋하지 않기
- ✅ 정기적인 시스템 업데이트 (sudo apt-get update && sudo apt-get upgrade)
- ✅ Fail2Ban 설치 (SSH 브루트포스 방어)
- ✅ UFW 방화벽 활성화

---

## 다음 단계

✅ MVP 배포 완료!

이제 다음을 진행하세요:
1. **애플리케이션 테스트** - 모든 기능 동작 확인
2. **모니터링 설정** - 리소스 사용률 추적
3. **백업 검증** - 백업 및 복구 테스트
4. **확장 계획** - [SCALING_ROADMAP.md](./SCALING_ROADMAP.md) 참조

---

## 관련 문서

- [Scaling Roadmap](./SCALING_ROADMAP.md) - MVP에서 프로덕션으로 확장
- [Troubleshooting](./TROUBLESHOOTING.md) - 문제 해결 가이드
- [AWS Deployment Guide](./AWS_DEPLOYMENT_GUIDE.md) - 전체 AWS 인프라
- [Operational Checklist](../server/docs/OPERATIONAL_CHECKLIST.md) - 운영 체크리스트

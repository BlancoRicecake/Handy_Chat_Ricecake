# EC2 Setup Guide

Complete guide for setting up and configuring an EC2 instance for the chat application.

---

## Prerequisites

- Completed [AWS Deployment Guide](./AWS_DEPLOYMENT_GUIDE.md)
- VPC and security groups created
- SSH key pair generated
- Domain name purchased (optional but recommended)

---

## Step 1: Create SSH Key Pair

### 1.1 Generate Key Pair

```bash
# Create key pair
aws ec2 create-key-pair \
  --key-name chat-app-key \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/chat-app-key.pem

# Set correct permissions
chmod 400 ~/.ssh/chat-app-key.pem

# Verify key
aws ec2 describe-key-pairs --key-names chat-app-key
```

---

## Step 2: Launch EC2 Instance

### 2.1 Find Latest Ubuntu AMI

```bash
# Get latest Ubuntu 22.04 LTS AMI
AMI_ID=$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text)

echo "Using AMI: $AMI_ID"
```

### 2.2 Launch Instance

```bash
# Get security group ID and subnet ID from AWS Deployment Guide
SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=chat-app-sg" --query 'SecurityGroups[0].GroupId' --output text)
SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=chat-app-public-subnet" --query 'Subnets[0].SubnetId' --output text)

# Launch instance
aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t3.medium \
  --key-name chat-app-key \
  --security-group-ids $SG_ID \
  --subnet-id $SUBNET_ID \
  --iam-instance-profile Name=chat-app-ec2-profile \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":20,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=chat-app-production}]' \
  --user-data file://user-data.sh

# Get instance ID
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=chat-app-production" "Name=instance-state-name,Values=running,pending" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text)

echo "Instance ID: $INSTANCE_ID"

# Wait for instance to be running
aws ec2 wait instance-running --instance-ids $INSTANCE_ID

# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo "Public IP: $PUBLIC_IP"
```

### 2.3 Create User Data Script (Optional)

If you didn't provide `--user-data`, you can set up the instance manually (see Step 3).

```bash
# Create user-data.sh
cat > user-data.sh << 'EOF'
#!/bin/bash
set -e

# Update system
apt-get update
apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker ubuntu

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install AWS CLI
apt-get install -y awscli

# Create application directory
mkdir -p /opt/chat-app
chown ubuntu:ubuntu /opt/chat-app

# Reboot to apply Docker group
reboot
EOF
```

---

## Step 3: Connect to EC2 Instance

### 3.1 SSH into Instance

```bash
# Connect via SSH
ssh -i ~/.ssh/chat-app-key.pem ubuntu@$PUBLIC_IP

# If connection refused, wait 30 seconds and try again
# Instance needs time to boot and apply user-data script
```

### 3.2 Verify Instance Setup

```bash
# Check Docker
docker --version
# Expected: Docker version 24.x.x

# Check Docker Compose
docker-compose --version
# Expected: Docker Compose version v2.24.x

# Check AWS CLI
aws --version
# Expected: aws-cli/1.x.x or 2.x.x
```

---

## Step 4: Install Dependencies (if not using user-data)

### 4.1 Update System

```bash
sudo apt-get update
sudo apt-get upgrade -y
```

### 4.2 Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker ubuntu

# Apply group changes (logout and login again)
exit
ssh -i ~/.ssh/chat-app-key.pem ubuntu@$PUBLIC_IP
```

### 4.3 Install Docker Compose

```bash
# Download Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Make executable
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker-compose --version
```

### 4.4 Install Additional Tools

```bash
# Install AWS CLI
sudo apt-get install -y awscli

# Install git
sudo apt-get install -y git

# Install jq (JSON processor)
sudo apt-get install -y jq

# Install curl and wget
sudo apt-get install -y curl wget
```

---

## Step 5: Setup Application

### 5.1 Create Application Directory

```bash
# Create directory
sudo mkdir -p /opt/chat-app
sudo chown ubuntu:ubuntu /opt/chat-app
cd /opt/chat-app
```

### 5.2 Clone Repository

```bash
# Option 1: Clone from GitHub (recommended)
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git .

# Option 2: Upload files via SCP (from local machine)
# scp -i ~/.ssh/chat-app-key.pem -r /path/to/project/* ubuntu@$PUBLIC_IP:/opt/chat-app/
```

### 5.3 Setup Environment Variables

```bash
# Run AWS environment setup script
cd /opt/chat-app
chmod +x server/scripts/setup-aws-env.sh
./server/scripts/setup-aws-env.sh

# Edit .env.production file
nano .env.production

# Update the following:
# - MONGO_URI (MongoDB Atlas connection string)
# - REDIS_URL (ElastiCache endpoint)
# - CORS_ORIGIN (your production domain)
# - S3_BUCKET_NAME, S3_ACCESS_KEY, S3_SECRET_KEY

# Save and exit (Ctrl+X, Y, Enter)
```

---

## Step 6: Configure Domain (Optional but Recommended)

### 6.1 Allocate Elastic IP

```bash
# Allocate Elastic IP
aws ec2 allocate-address --domain vpc

# Get allocation ID
ALLOCATION_ID=$(aws ec2 describe-addresses --filters "Name=domain,Values=vpc" --query 'Addresses[0].AllocationId' --output text)

# Associate with instance
aws ec2 associate-address \
  --instance-id $INSTANCE_ID \
  --allocation-id $ALLOCATION_ID

# Get Elastic IP
ELASTIC_IP=$(aws ec2 describe-addresses --allocation-ids $ALLOCATION_ID --query 'Addresses[0].PublicIp' --output text)

echo "Elastic IP: $ELASTIC_IP"
```

### 6.2 Configure DNS (Route 53 or External)

#### Using Route 53:

```bash
# Create hosted zone
aws route53 create-hosted-zone \
  --name yourdomain.com \
  --caller-reference $(date +%s)

# Get hosted zone ID
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name=='yourdomain.com.'].Id" --output text | cut -d'/' -f3)

# Create A record
cat > create-record.json << EOF
{
  "Changes": [{
    "Action": "CREATE",
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
  --change-batch file://create-record.json

# Create www subdomain
cat > create-www-record.json << EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "www.yourdomain.com",
      "Type": "A",
      "TTL": 300,
      "ResourceRecords": [{"Value": "$ELASTIC_IP"}]
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://create-www-record.json
```

#### Using External DNS Provider:

1. Go to your DNS provider (Namecheap, GoDaddy, Cloudflare, etc.)
2. Add an A record:
   - Host: @ (or yourdomain.com)
   - Value: Your Elastic IP
   - TTL: 300 (or Auto)
3. Add a CNAME record for www:
   - Host: www
   - Value: yourdomain.com
   - TTL: 300 (or Auto)

### 6.3 Update Caddyfile with Domain

```bash
# SSH into EC2
ssh -i ~/.ssh/chat-app-key.pem ubuntu@$ELASTIC_IP

# Edit Caddyfile
cd /opt/chat-app
nano caddy/Caddyfile

# Replace :80, :443 with your domain
# Before:
# :80, :443 {
#   ...
# }

# After:
# yourdomain.com, www.yourdomain.com {
#   ...
# }

# Save and exit
```

---

## Step 7: Run MongoDB Indexes

```bash
# SSH into EC2
cd /opt/chat-app/server

# Install Node.js temporarily (for running create-indexes script)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install dependencies
npm ci

# Run index creation
npx ts-node scripts/create-indexes.ts

# Verify indexes created
echo "MongoDB indexes created successfully"
```

---

## Step 8: Deploy Application

### 8.1 Initial Deployment

```bash
# SSH into EC2
cd /opt/chat-app

# Make scripts executable
chmod +x server/scripts/*.sh

# Run deployment
./server/scripts/deploy.sh

# Monitor logs
docker-compose -f docker-compose.production.yml logs -f
```

### 8.2 Verify Deployment

```bash
# Check health endpoint
curl http://localhost/health
# Expected: {"ok":true,"ts":"2024-01-15T..."}

# Check containers
docker-compose -f docker-compose.production.yml ps

# Check logs
docker-compose -f docker-compose.production.yml logs --tail=50 api
docker-compose -f docker-compose.production.yml logs --tail=50 caddy
```

### 8.3 Test from External

```bash
# From local machine
curl https://yourdomain.com/health
# Expected: {"ok":true,"ts":"2024-01-15T..."}

# Test HTTPS certificate
curl -v https://yourdomain.com 2>&1 | grep "SSL certificate"
# Should show valid Let's Encrypt certificate
```

---

## Step 9: Configure Automatic Backups

### 9.1 Create Backup Script

```bash
# SSH into EC2
cat > /opt/chat-app/backup.sh << 'EOF'
#!/bin/bash
set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/chat-app/backups"

mkdir -p $BACKUP_DIR

# Backup environment file
cp /opt/chat-app/.env.production $BACKUP_DIR/.env.production.$TIMESTAMP

# Backup Docker volumes
docker run --rm -v caddy-data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/caddy-data_$TIMESTAMP.tar.gz /data

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name ".env.production.*" -mtime +7 -delete

echo "Backup completed: $TIMESTAMP"
EOF

chmod +x /opt/chat-app/backup.sh
```

### 9.2 Setup Cron Job

```bash
# Add cron job for daily backups at 2 AM
crontab -e

# Add this line:
0 2 * * * /opt/chat-app/backup.sh >> /opt/chat-app/logs/backup.log 2>&1
```

---

## Step 10: Configure CloudWatch Logging (Optional)

### 10.1 Install CloudWatch Agent

```bash
# Download CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb

# Install
sudo dpkg -i amazon-cloudwatch-agent.deb

# Configure agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
```

### 10.2 Configure Log Streaming

```bash
# Create CloudWatch config
sudo cat > /opt/aws/amazon-cloudwatch-agent/etc/config.json << EOF
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/opt/chat-app/logs/deploy*.log",
            "log_group_name": "/aws/ec2/chat-app/deploy",
            "log_stream_name": "{instance_id}"
          },
          {
            "file_path": "/var/lib/docker/containers/*/*.log",
            "log_group_name": "/aws/ec2/chat-app/docker",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
EOF

# Start agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json
```

---

## Step 11: Security Hardening

### 11.1 Configure Firewall (UFW)

```bash
# Install UFW
sudo apt-get install -y ufw

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw --force enable

# Check status
sudo ufw status
```

### 11.2 Configure Fail2Ban

```bash
# Install Fail2Ban
sudo apt-get install -y fail2ban

# Configure
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Edit configuration
sudo nano /etc/fail2ban/jail.local

# Set:
# bantime = 3600
# maxretry = 3

# Restart service
sudo systemctl restart fail2ban
sudo systemctl enable fail2ban
```

### 11.3 Disable Root Login

```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Set:
# PermitRootLogin no
# PasswordAuthentication no

# Restart SSH
sudo systemctl restart sshd
```

---

## Maintenance Tasks

### Daily Checks

```bash
# Check disk space
df -h

# Check memory usage
free -h

# Check Docker container status
docker ps

# Check application logs
docker-compose -f /opt/chat-app/docker-compose.production.yml logs --tail=100
```

### Weekly Tasks

```bash
# Update system packages
sudo apt-get update
sudo apt-get upgrade -y

# Clean up Docker
docker system prune -a -f

# Check security updates
sudo apt list --upgradable
```

### Monthly Tasks

```bash
# Review CloudWatch metrics
# Review backup integrity
# Review security logs
# Update dependencies (coordinate with development team)
```

---

## Troubleshooting

See [Troubleshooting Guide](./TROUBLESHOOTING.md) for common issues and solutions.

---

## Next Steps

✅ EC2 instance configured and application deployed!

Continue with:
1. **[CI/CD Setup Guide](./CICD_SETUP_GUIDE.md)** - Automate deployments with GitHub Actions
2. **[Operational Checklist](../server/docs/OPERATIONAL_CHECKLIST.md)** - Monitoring and maintenance
3. **[Recovery Playbook](../server/docs/RECOVERY_PLAYBOOK.md)** - Disaster recovery procedures

---

## Instance Snapshot and AMI Creation

### Create AMI for Quick Recovery

```bash
# Create AMI from running instance
aws ec2 create-image \
  --instance-id $INSTANCE_ID \
  --name "chat-app-golden-image-$(date +%Y%m%d)" \
  --description "Chat app production image with Docker and dependencies" \
  --no-reboot

# List AMIs
aws ec2 describe-images --owners self
```

---

## Monitoring and Alerts

### Set up CloudWatch Alarms

```bash
# CPU utilization alarm
aws cloudwatch put-metric-alarm \
  --alarm-name chat-app-high-cpu \
  --alarm-description "Alert when CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=InstanceId,Value=$INSTANCE_ID \
  --evaluation-periods 2

# Disk space alarm (requires CloudWatch agent)
# Memory alarm (requires CloudWatch agent)
```

---

## Cost Optimization

### Use Spot Instances (for non-critical environments)

```bash
# Launch spot instance (70% cheaper)
aws ec2 request-spot-instances \
  --spot-price "0.05" \
  --instance-count 1 \
  --type "one-time" \
  --launch-specification file://spot-spec.json
```

### Stop instance during off-hours

```bash
# Stop instance at night (if applicable)
# Create Lambda function or use AWS Instance Scheduler
```

---

## Support

- AWS Support: https://console.aws.amazon.com/support/
- EC2 Documentation: https://docs.aws.amazon.com/ec2/
- Project Issues: GitHub Issues

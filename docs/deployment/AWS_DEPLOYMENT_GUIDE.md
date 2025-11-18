# AWS Deployment Guide

Complete guide for deploying the chat application to AWS using EC2 + managed services.

---

## Architecture Overview

```
[Users]
   ↓
[Route 53] (DNS)
   ↓
[EC2 Instance] (t3.medium)
├─ Caddy (Reverse Proxy + HTTPS)
└─ NestJS API
   ├─→ [MongoDB Atlas] (Database)
   ├─→ [ElastiCache Redis] (Cache)
   ├─→ [S3] (File Storage)
   └─→ [Secrets Manager] (JWT Secrets)

[CloudWatch] (Monitoring & Logs)
[ECR] (Docker Images)
[GitHub Actions] (CI/CD)
```

---

## Prerequisites

### 1. AWS Account Setup

```bash
# Create AWS account
# Sign up: https://aws.amazon.com/

# Install AWS CLI
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Windows
# Download: https://aws.amazon.com/cli/

# Configure AWS CLI
aws configure
# AWS Access Key ID: YOUR_ACCESS_KEY
# AWS Secret Access Key: YOUR_SECRET_KEY
# Default region: us-east-1
# Default output format: json
```

### 2. Required Services

| Service | Purpose | Estimated Cost |
|---------|---------|----------------|
| EC2 (t3.medium) | Application hosting | ~$30/month |
| MongoDB Atlas | Database (M10) | ~$50/month |
| ElastiCache (t3.micro) | Redis cache | ~$15/month |
| S3 | File storage | ~$2-5/month |
| ECR | Docker image registry | ~$1/month |
| Secrets Manager | JWT secrets | ~$0.40/month |
| **Total** | | **~$100-110/month** |

---

## Step 1: Network Infrastructure (VPC)

### 1.1 Create VPC

```bash
# Create VPC
aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=chat-app-vpc}]'

# Enable DNS hostnames
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=chat-app-vpc" --query 'Vpcs[0].VpcId' --output text)

aws ec2 modify-vpc-attribute \
  --vpc-id $VPC_ID \
  --enable-dns-hostnames
```

### 1.2 Create Subnets

```bash
# Public subnet
aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=chat-app-public-subnet}]'

PUBLIC_SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=chat-app-public-subnet" --query 'Subnets[0].SubnetId' --output text)

# Enable auto-assign public IP
aws ec2 modify-subnet-attribute \
  --subnet-id $PUBLIC_SUBNET_ID \
  --map-public-ip-on-launch
```

### 1.3 Create Internet Gateway

```bash
# Create Internet Gateway
aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=chat-app-igw}]'

IGW_ID=$(aws ec2 describe-internet-gateways --filters "Name=tag:Name,Values=chat-app-igw" --query 'InternetGateways[0].InternetGatewayId' --output text)

# Attach to VPC
aws ec2 attach-internet-gateway \
  --vpc-id $VPC_ID \
  --internet-gateway-id $IGW_ID
```

### 1.4 Configure Route Table

```bash
# Get default route table
ROUTE_TABLE_ID=$(aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC_ID" --query 'RouteTables[0].RouteTableId' --output text)

# Add route to Internet Gateway
aws ec2 create-route \
  --route-table-id $ROUTE_TABLE_ID \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id $IGW_ID
```

---

## Step 2: Security Groups

### 2.1 Create Security Group

```bash
# Create security group
aws ec2 create-security-group \
  --group-name chat-app-sg \
  --description "Security group for chat application" \
  --vpc-id $VPC_ID

SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=chat-app-sg" --query 'SecurityGroups[0].GroupId' --output text)
```

### 2.2 Configure Inbound Rules

```bash
# Allow HTTP (80)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

# Allow HTTPS (443)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# Allow SSH (22) - Restrict to your IP!
MY_IP=$(curl -s ifconfig.me)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 22 \
  --cidr $MY_IP/32
```

---

## Step 3: MongoDB Atlas Setup

### 3.1 Create MongoDB Atlas Cluster

```bash
# Visit: https://cloud.mongodb.com/
# 1. Create account or sign in
# 2. Create new project: "chat-app-production"
# 3. Build a Cluster:
#    - Provider: AWS
#    - Region: us-east-1 (same as EC2)
#    - Tier: M10 (minimum for production)
#    - Cluster Name: chat-db

# Wait for cluster to be created (5-10 minutes)
```

### 3.2 Configure Network Access

```bash
# Option 1: VPC Peering (Recommended for production)
# Follow: https://docs.atlas.mongodb.com/security-vpc-peering/

# Option 2: Private Endpoint (Most secure)
# Follow: https://docs.atlas.mongodb.com/security-private-endpoint/

# Option 3: IP Allowlist (Quick setup, less secure)
# Add your EC2 Elastic IP to allowlist
```

### 3.3 Create Database User

```bash
# In MongoDB Atlas UI:
# Database Access → Add New Database User
# Username: chat-app-prod
# Password: Generate strong password (32+ characters)
# Database User Privileges: Read and write to any database
# Built-in Role: readWrite
```

### 3.4 Get Connection String

```bash
# In MongoDB Atlas UI:
# Clusters → Connect → Connect your application
# Driver: Node.js
# Version: 4.1 or later

# Connection string format:
# mongodb+srv://chat-app-prod:PASSWORD@cluster.xxxxx.mongodb.net/chatdb?retryWrites=true&w=majority

# ⚠️ URL encode special characters in password!
# Example: p@ssw0rd → p%40ssw0rd
```

---

## Step 4: ElastiCache Redis Setup

### 4.1 Create Redis Subnet Group

```bash
# Create subnet group for Redis
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name chat-app-redis-subnet \
  --cache-subnet-group-description "Subnet group for chat app Redis" \
  --subnet-ids $PUBLIC_SUBNET_ID
```

### 4.2 Create Redis Security Group

```bash
# Create security group for Redis
aws ec2 create-security-group \
  --group-name chat-app-redis-sg \
  --description "Security group for Redis" \
  --vpc-id $VPC_ID

REDIS_SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=chat-app-redis-sg" --query 'SecurityGroups[0].GroupId' --output text)

# Allow Redis port from app security group
aws ec2 authorize-security-group-ingress \
  --group-id $REDIS_SG_ID \
  --protocol tcp \
  --port 6379 \
  --source-group $SG_ID
```

### 4.3 Create Redis Cluster

```bash
# Create Redis cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id chat-app-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --engine-version 7.0 \
  --num-cache-nodes 1 \
  --cache-subnet-group-name chat-app-redis-subnet \
  --security-group-ids $REDIS_SG_ID \
  --port 6379 \
  --preferred-availability-zone us-east-1a

# Wait for cluster to be available (5-10 minutes)
aws elasticache wait cache-cluster-available --cache-cluster-id chat-app-redis

# Get Redis endpoint
REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id chat-app-redis \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text)

echo "Redis endpoint: $REDIS_ENDPOINT:6379"
```

---

## Step 5: S3 Bucket Setup

### 5.1 Create S3 Bucket

```bash
# Create bucket (bucket names must be globally unique)
BUCKET_NAME="chat-app-files-$(date +%s)"

aws s3api create-bucket \
  --bucket $BUCKET_NAME \
  --region us-east-1

echo "Bucket created: $BUCKET_NAME"
```

### 5.2 Enable Encryption

```bash
# Enable server-side encryption (AES-256)
aws s3api put-bucket-encryption \
  --bucket $BUCKET_NAME \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'
```

### 5.3 Enable Versioning

```bash
# Enable versioning
aws s3api put-bucket-versioning \
  --bucket $BUCKET_NAME \
  --versioning-configuration Status=Enabled
```

### 5.4 Configure CORS

```bash
# Create CORS configuration
cat > cors-config.json << EOF
{
  "CORSRules": [{
    "AllowedOrigins": ["https://yourdomain.com"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
}
EOF

aws s3api put-bucket-cors \
  --bucket $BUCKET_NAME \
  --cors-configuration file://cors-config.json
```

### 5.5 Create IAM User for S3 Access

```bash
# Create IAM user
aws iam create-user --user-name chat-app-s3-user

# Create policy
cat > s3-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ],
    "Resource": [
      "arn:aws:s3:::$BUCKET_NAME",
      "arn:aws:s3:::$BUCKET_NAME/*"
    ]
  }]
}
EOF

# Attach policy
aws iam put-user-policy \
  --user-name chat-app-s3-user \
  --policy-name ChatAppS3Access \
  --policy-document file://s3-policy.json

# Create access keys
aws iam create-access-key --user-name chat-app-s3-user
# Save the AccessKeyId and SecretAccessKey!
```

---

## Step 6: AWS Secrets Manager

### 6.1 Generate JWT Secrets

```bash
# Generate strong JWT secrets
JWT_SECRET_CURRENT=$(openssl rand -base64 64 | tr -d '\n')
JWT_SECRET_PREVIOUS=$(openssl rand -base64 64 | tr -d '\n')

echo "Current Secret: $JWT_SECRET_CURRENT"
echo "Previous Secret: $JWT_SECRET_PREVIOUS"
```

### 6.2 Create Secret in Secrets Manager

```bash
# Create secret
aws secretsmanager create-secret \
  --name chat-app/jwt-secrets \
  --description "JWT secrets for chat application" \
  --secret-string "{\"current\":\"$JWT_SECRET_CURRENT\",\"previous\":\"$JWT_SECRET_PREVIOUS\"}"

# Verify secret
aws secretsmanager get-secret-value \
  --secret-id chat-app/jwt-secrets \
  --query SecretString \
  --output text
```

---

## Step 7: ECR Repository Setup

### 7.1 Create ECR Repositories

```bash
# Create repository for API
aws ecr create-repository \
  --repository-name chat-api \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256

# Create repository for Caddy
aws ecr create-repository \
  --repository-name chat-caddy \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256

# Get repository URIs
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "API Repository: $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/chat-api"
echo "Caddy Repository: $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/chat-caddy"
```

---

## Step 8: IAM Role for EC2

### 8.1 Create IAM Role

```bash
# Create trust policy
cat > trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ec2.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Create role
aws iam create-role \
  --role-name chat-app-ec2-role \
  --assume-role-policy-document file://trust-policy.json
```

### 8.2 Attach Policies

```bash
# Attach ECR read policy
aws iam attach-role-policy \
  --role-name chat-app-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly

# Create custom policy for Secrets Manager
cat > secrets-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "secretsmanager:GetSecretValue"
    ],
    "Resource": "arn:aws:secretsmanager:us-east-1:$AWS_ACCOUNT_ID:secret:chat-app/*"
  }]
}
EOF

aws iam put-role-policy \
  --role-name chat-app-ec2-role \
  --policy-name SecretsManagerAccess \
  --policy-document file://secrets-policy.json

# Create instance profile
aws iam create-instance-profile \
  --instance-profile-name chat-app-ec2-profile

# Add role to instance profile
aws iam add-role-to-instance-profile \
  --instance-profile-name chat-app-ec2-profile \
  --role-name chat-app-ec2-role
```

---

## Next Steps

✅ Infrastructure setup complete!

Continue with:
1. **[EC2 Setup Guide](./EC2_SETUP_GUIDE.md)** - Launch and configure EC2 instance
2. **[CI/CD Setup Guide](./CICD_SETUP_GUIDE.md)** - Configure GitHub Actions
3. **[Troubleshooting](./TROUBLESHOOTING.md)** - Common issues and solutions

---

## Resource Cleanup

To delete all resources (WARNING: This will delete all data!):

```bash
# Delete EC2 instance (see EC2_SETUP_GUIDE.md)
# Delete ElastiCache cluster
aws elasticache delete-cache-cluster --cache-cluster-id chat-app-redis

# Delete S3 bucket
aws s3 rb s3://$BUCKET_NAME --force

# Delete ECR repositories
aws ecr delete-repository --repository-name chat-api --force
aws ecr delete-repository --repository-name chat-caddy --force

# Delete Secrets Manager secret
aws secretsmanager delete-secret --secret-id chat-app/jwt-secrets --force-delete-without-recovery

# Delete VPC resources (in reverse order)
aws ec2 delete-security-group --group-id $SG_ID
aws ec2 delete-security-group --group-id $REDIS_SG_ID
aws ec2 detach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID
aws ec2 delete-internet-gateway --internet-gateway-id $IGW_ID
aws ec2 delete-subnet --subnet-id $PUBLIC_SUBNET_ID
aws ec2 delete-vpc --vpc-id $VPC_ID
```

---

## Cost Optimization Tips

1. **Use Reserved Instances**: Save 30-40% on EC2 costs
2. **Enable S3 Lifecycle Policies**: Move old files to Glacier
3. **Use ElastiCache Reserved Nodes**: Save 30-50% on Redis
4. **Monitor with AWS Cost Explorer**: Track spending
5. **Set up Billing Alarms**: Get notified at $100/month threshold

---

## Security Best Practices

1. ✅ Never expose MongoDB/Redis publicly
2. ✅ Use VPC Peering or Private Endpoints
3. ✅ Enable encryption at rest and in transit
4. ✅ Rotate JWT secrets quarterly
5. ✅ Use IAM roles instead of access keys
6. ✅ Enable CloudTrail for audit logging
7. ✅ Set up AWS GuardDuty for threat detection
8. ✅ Restrict SSH access to your IP only

---

## Support

- AWS Support: https://console.aws.amazon.com/support/
- MongoDB Atlas Support: https://support.mongodb.com/
- Project Issues: GitHub Issues

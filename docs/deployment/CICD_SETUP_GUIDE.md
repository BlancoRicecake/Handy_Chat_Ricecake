# CI/CD Setup Guide

Complete guide for setting up automated CI/CD pipelines with GitHub Actions.

---

## Overview

The CI/CD pipeline consists of two workflows:

1. **CI (Continuous Integration)** - `.github/workflows/ci.yml`
   - Runs on every push and pull request
   - Lints, type-checks, and builds code
   - Builds Docker images
   - Scans for security vulnerabilities

2. **CD (Continuous Deployment)** - `.github/workflows/cd.yml`
   - Runs on push to `main` branch or version tags
   - Pushes images to AWS ECR
   - Deploys to EC2 via SSH
   - Runs health checks
   - Sends Slack notifications

---

## Prerequisites

- Completed [AWS Deployment Guide](./AWS_DEPLOYMENT_GUIDE.md)
- Completed [EC2 Setup Guide](./EC2_SETUP_GUIDE.md)
- GitHub repository created
- Admin access to GitHub repository settings

---

## Step 1: Configure GitHub Secrets

GitHub Secrets store sensitive credentials securely. Never commit credentials to code!

### 1.1 Navigate to Secrets

```
GitHub Repository → Settings → Secrets and variables → Actions → New repository secret
```

### 1.2 Add Required Secrets

#### AWS Credentials

| Secret Name | Value | How to Get |
|------------|-------|------------|
| `AWS_ACCOUNT_ID` | Your AWS account ID (12 digits) | `aws sts get-caller-identity --query Account --output text` |
| `AWS_ACCESS_KEY_ID` | IAM user access key | Created in Step 1.3 below |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key | Created in Step 1.3 below |

#### EC2 Deployment

| Secret Name | Value | How to Get |
|------------|-------|------------|
| `EC2_HOST` | EC2 instance public IP or Elastic IP | `aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text` |
| `EC2_USERNAME` | SSH username (usually `ubuntu`) | Default: `ubuntu` |
| `EC2_SSH_PRIVATE_KEY` | SSH private key content | `cat ~/.ssh/chat-app-key.pem` (copy entire content) |
| `EC2_SSH_PORT` | SSH port (optional) | Default: `22` |

#### Optional Secrets

| Secret Name | Value | Purpose |
|------------|-------|---------|
| `PRODUCTION_DOMAIN` | yourdomain.com | For environment URL in GitHub |
| `SLACK_WEBHOOK_URL` | https://hooks.slack.com/... | Deployment notifications |

---

## Step 2: Create IAM User for GitHub Actions

### 2.1 Create IAM User

```bash
# Create IAM user
aws iam create-user --user-name github-actions-deployer

# Create policy
cat > github-actions-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    }
  ]
}
EOF

# Attach policy
aws iam put-user-policy \
  --user-name github-actions-deployer \
  --policy-name ECRPushAccess \
  --policy-document file://github-actions-policy.json
```

### 2.2 Create Access Keys

```bash
# Create access keys
aws iam create-access-key --user-name github-actions-deployer

# Output:
# {
#     "AccessKey": {
#         "UserName": "github-actions-deployer",
#         "AccessKeyId": "AKIA...",
#         "SecretAccessKey": "...",
#         "Status": "Active",
#         "CreateDate": "2024-01-15T..."
#     }
# }

# ⚠️ IMPORTANT: Save AccessKeyId and SecretAccessKey!
# Add them to GitHub Secrets as AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
```

---

## Step 3: Configure SSH Access for GitHub Actions

### 3.1 Prepare SSH Private Key

```bash
# Display private key content
cat ~/.ssh/chat-app-key.pem

# Copy the entire output (including BEGIN and END lines)
# Example:
# -----BEGIN RSA PRIVATE KEY-----
# MIIEpAIBAAKCAQEA...
# ...
# -----END RSA PRIVATE KEY-----
```

### 3.2 Add to GitHub Secrets

1. Go to GitHub Repository → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `EC2_SSH_PRIVATE_KEY`
4. Value: Paste the entire private key content (including BEGIN/END lines)
5. Click "Add secret"

### 3.3 Test SSH Connection

```bash
# From local machine, test SSH connection
ssh -i ~/.ssh/chat-app-key.pem ubuntu@$EC2_HOST

# If connection works, GitHub Actions will also work
```

---

## Step 4: Configure ECR for GitHub Actions

### 4.1 Verify ECR Repositories

```bash
# List ECR repositories
aws ecr describe-repositories

# Expected output: chat-api and chat-caddy repositories
```

### 4.2 Update CD Workflow (if needed)

The CD workflow (`.github/workflows/cd.yml`) is pre-configured to use:
- Repository: `chat-api` and `chat-caddy`
- Region: `us-east-1`

If you used different names or regions, update the workflow:

```yaml
env:
  AWS_REGION: us-east-1  # Change if different
  ECR_REGISTRY: ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.us-east-1.amazonaws.com
  ECR_API_REPOSITORY: chat-api  # Change if different
  ECR_CADDY_REPOSITORY: chat-caddy  # Change if different
```

---

## Step 5: Configure Slack Notifications (Optional)

### 5.1 Create Slack Webhook

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. App Name: "GitHub Deployments"
4. Workspace: Select your workspace
5. Click "Incoming Webhooks"
6. Activate Incoming Webhooks: ON
7. Click "Add New Webhook to Workspace"
8. Select channel (e.g., #deployments)
9. Copy the Webhook URL

### 5.2 Add to GitHub Secrets

1. GitHub Repository → Settings → Secrets
2. Name: `SLACK_WEBHOOK_URL`
3. Value: Your webhook URL (e.g., `https://hooks.slack.com/services/...`)
4. Click "Add secret"

### 5.3 Test Slack Notification

```bash
# From local machine, test webhook
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Test notification from GitHub Actions"}' \
  YOUR_WEBHOOK_URL
```

---

## Step 6: Prepare EC2 for Automated Deployments

### 6.1 Configure AWS CLI on EC2

```bash
# SSH into EC2
ssh -i ~/.ssh/chat-app-key.pem ubuntu@$EC2_HOST

# Configure AWS CLI (uses IAM role attached to EC2)
aws configure
# AWS Access Key ID: (press Enter to skip)
# AWS Secret Access Key: (press Enter to skip)
# Default region: us-east-1
# Default output format: json

# Test AWS CLI
aws sts get-caller-identity
```

### 6.2 Setup Project Directory

```bash
# Create project directory if not exists
sudo mkdir -p /opt/chat-app
sudo chown ubuntu:ubuntu /opt/chat-app

# Clone repository (first time only)
cd /opt/chat-app
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git .

# Or if already cloned, pull latest
git pull origin main
```

### 6.3 Setup .env.production

```bash
# Run setup script (if not already done)
cd /opt/chat-app
./server/scripts/setup-aws-env.sh

# Edit and verify .env.production
nano .env.production
```

---

## Step 7: Test CI Workflow

### 7.1 Trigger CI Workflow

```bash
# From local machine, make a small change
cd /path/to/your/project

# Create a test branch
git checkout -b test-ci

# Make a change
echo "# Test CI" >> README.md

# Commit and push
git add .
git commit -m "test: Trigger CI workflow"
git push origin test-ci

# Create pull request on GitHub
```

### 7.2 Monitor CI Workflow

1. Go to GitHub Repository → Actions
2. Click on the running workflow
3. Monitor each job:
   - ✅ Lint, Type-check & Build
   - ✅ Docker Build & Security Scan

### 7.3 Verify CI Results

Expected results:
- ✅ ESLint passes
- ✅ Prettier passes
- ✅ TypeScript type check passes
- ✅ Build succeeds
- ✅ Docker images build successfully
- ✅ Trivy security scan completes (may show vulnerabilities)

---

## Step 8: Test CD Workflow (Deployment)

### 8.1 Merge to Main Branch

```bash
# Merge test branch to main
git checkout main
git merge test-ci
git push origin main

# Or merge pull request on GitHub
```

### 8.2 Monitor CD Workflow

1. Go to GitHub Repository → Actions
2. Click on the CD workflow
3. Monitor jobs:
   - ✅ Build & Push to ECR
   - ✅ Deploy to EC2
   - ✅ Health check
   - ✅ Slack notification (if configured)

### 8.3 Verify Deployment

```bash
# SSH into EC2
ssh -i ~/.ssh/chat-app-key.pem ubuntu@$EC2_HOST

# Check running containers
docker ps

# Check logs
cd /opt/chat-app
docker-compose -f docker-compose.production.yml logs --tail=50

# Test health endpoint
curl http://localhost/health
```

### 8.4 Test from External

```bash
# From local machine
curl https://yourdomain.com/health

# Expected: {"ok":true,"ts":"2024-01-15T..."}
```

---

## Step 9: Setup Branch Protection Rules

### 9.1 Configure Main Branch Protection

1. GitHub Repository → Settings → Branches
2. Click "Add rule"
3. Branch name pattern: `main`
4. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
     - Select: `Lint, Type-check & Build`
     - Select: `Docker Build & Security Scan`
   - ✅ Require branches to be up to date before merging
   - ✅ Include administrators (optional)
5. Click "Create"

---

## Step 10: Setup Deployment Environments

### 10.1 Create Production Environment

1. GitHub Repository → Settings → Environments
2. Click "New environment"
3. Name: `production`
4. Click "Configure environment"
5. Enable:
   - ✅ Required reviewers (optional, for manual approval)
   - ✅ Wait timer (optional, e.g., 5 minutes)
6. Add environment secrets (optional, if different from repo secrets)

### 10.2 Test Manual Deployment

1. GitHub Repository → Actions
2. Select "CD (Continuous Deployment)" workflow
3. Click "Run workflow"
4. Select branch: `main`
5. Click "Run workflow"

---

## Workflow Triggers

### CI Workflow Triggers

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
```

**When it runs:**
- Every push to `main` or `develop` branch
- Every pull request to `main` or `develop` branch

### CD Workflow Triggers

```yaml
on:
  push:
    branches: [main]
    tags: ['v*.*.*']
  workflow_dispatch:
```

**When it runs:**
- Every push to `main` branch
- Every version tag push (e.g., `v1.0.0`)
- Manual trigger via GitHub Actions UI

---

## Deployment Strategies

### 1. Automatic Deployment (Current Setup)

```
git push origin main → CI passes → CD deploys automatically
```

**Pros:**
- Fast deployments
- No manual intervention

**Cons:**
- No manual review before production

### 2. Manual Approval (Recommended for Production)

Update `.github/workflows/cd.yml`:

```yaml
deploy-to-ec2:
  name: Deploy to EC2
  needs: build-and-push
  environment:
    name: production  # Enables manual approval
    url: https://${{ secrets.PRODUCTION_DOMAIN }}
```

Then configure reviewers in GitHub Settings → Environments → production.

### 3. Tag-based Deployment

Only deploy on version tags:

```yaml
on:
  push:
    tags:
      - 'v*.*.*'  # Only deploy on version tags like v1.0.0
```

**Usage:**
```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## Monitoring Deployments

### GitHub Actions Dashboard

1. GitHub Repository → Actions
2. View workflow runs
3. Click on run to see details
4. Download logs for debugging

### Slack Notifications

If configured, you'll receive notifications for:
- ✅ Successful deployments
- ❌ Failed deployments
- 📊 Deployment details (branch, commit, author)

### CloudWatch Logs (if configured)

```bash
# View logs in AWS Console
aws logs tail /aws/ec2/chat-app/deploy --follow
```

---

## Troubleshooting

### Issue: CI fails with "Permission denied"

**Solution:**
```bash
# Make scripts executable in repository
chmod +x server/scripts/*.sh
git add .
git commit -m "fix: Make scripts executable"
git push
```

### Issue: CD fails with "Could not resolve host"

**Cause:** Incorrect `EC2_HOST` secret

**Solution:**
1. Verify EC2 public IP: `aws ec2 describe-instances`
2. Update GitHub secret `EC2_HOST`

### Issue: CD fails with "Permission denied (publickey)"

**Cause:** SSH key mismatch

**Solution:**
1. Verify SSH key: `cat ~/.ssh/chat-app-key.pem`
2. Update GitHub secret `EC2_SSH_PRIVATE_KEY` with entire key content
3. Ensure key format includes BEGIN/END lines

### Issue: Deployment succeeds but health check fails

**Cause:** Application not starting correctly

**Solution:**
```bash
# SSH into EC2
ssh -i ~/.ssh/chat-app-key.pem ubuntu@$EC2_HOST

# Check logs
cd /opt/chat-app
docker-compose -f docker-compose.production.yml logs --tail=100

# Check environment variables
cat .env.production

# Manually run health check
./server/scripts/health-check.sh
```

### Issue: Docker images fail to push to ECR

**Cause:** IAM permissions or ECR repository not found

**Solution:**
```bash
# Verify ECR repositories exist
aws ecr describe-repositories

# Verify IAM user has ECR permissions
aws iam get-user-policy --user-name github-actions-deployer --policy-name ECRPushAccess
```

---

## Best Practices

### 1. Never Commit Secrets

```bash
# ❌ BAD: Committing secrets
AWS_SECRET_KEY=abc123...

# ✅ GOOD: Use GitHub Secrets
AWS_SECRET_KEY=${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

### 2. Use Separate Environments

```yaml
# Different secrets for staging and production
environment:
  name: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
```

### 3. Test Before Deploying

```bash
# Run tests locally before pushing
npm test
npm run lint
npm run type-check
npm run build
```

### 4. Use Semantic Versioning

```bash
# Tag releases with semantic versions
git tag v1.0.0  # Major release
git tag v1.1.0  # Minor update
git tag v1.1.1  # Patch/bugfix
```

### 5. Monitor Deployments

- Check Slack notifications
- Monitor application logs
- Review health check results
- Set up CloudWatch alarms

---

## Advanced Configuration

### Blue-Green Deployment

For zero-downtime deployments, modify `deploy.sh`:

```bash
# Start new containers with different names
docker-compose -f docker-compose.production.yml -p chat-app-blue up -d

# Test new deployment
./server/scripts/health-check.sh

# Switch traffic (update Caddy config)
# Stop old containers
docker-compose -f docker-compose.production.yml -p chat-app-green down
```

### Canary Deployment

Gradually roll out to percentage of users:
- Deploy new version to subset of instances
- Monitor metrics
- Gradually increase traffic
- Requires load balancer (ALB)

### Rollback on Failure

Add to CD workflow:

```yaml
- name: Rollback on failure
  if: failure()
  run: |
    ssh -i ~/.ssh/chat-app-key.pem ubuntu@${{ secrets.EC2_HOST }} '
      cd /opt/chat-app
      ./server/scripts/rollback.sh
    '
```

---

## Security Checklist

- ✅ All secrets stored in GitHub Secrets
- ✅ IAM user has minimal required permissions
- ✅ SSH private key never exposed in logs
- ✅ Branch protection rules enabled
- ✅ Required reviews for production deployments
- ✅ Security scanning enabled (Trivy)
- ✅ Secrets rotation scheduled (quarterly)

---

## Next Steps

✅ CI/CD pipeline configured and tested!

Continue with:
1. **[Operational Checklist](../server/docs/OPERATIONAL_CHECKLIST.md)** - Daily/weekly/monthly tasks
2. **[Recovery Playbook](../server/docs/RECOVERY_PLAYBOOK.md)** - Disaster recovery
3. **[Troubleshooting](./TROUBLESHOOTING.md)** - Common issues and solutions

---

## Support

- GitHub Actions Documentation: https://docs.github.com/actions
- AWS ECR Documentation: https://docs.aws.amazon.com/ecr/
- Project Issues: GitHub Issues

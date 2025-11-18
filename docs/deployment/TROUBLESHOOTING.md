# Deployment Troubleshooting Guide

Common issues and solutions for AWS deployment.

---

## Table of Contents

1. [Deployment Issues](#deployment-issues)
2. [Docker Issues](#docker-issues)
3. [Database Connection Issues](#database-connection-issues)
4. [Redis Connection Issues](#redis-connection-issues)
5. [S3 Storage Issues](#s3-storage-issues)
6. [SSL/HTTPS Issues](#sslhttps-issues)
7. [Performance Issues](#performance-issues)
8. [CI/CD Pipeline Issues](#cicd-pipeline-issues)

---

## Deployment Issues

### Issue: Health check fails after deployment

**Symptoms:**
```bash
[ERROR] Health check failed
[ERROR] Health check timeout reached after 300s
```

**Diagnosis:**
```bash
# SSH into EC2
ssh -i ~/.ssh/chat-app-key.pem ubuntu@$EC2_HOST

# Check container status
docker ps

# Check logs
docker-compose -f docker-compose.production.yml logs --tail=100 api

# Test health endpoint directly
curl http://localhost:3000/health
curl http://localhost/health  # Through Caddy
```

**Common Causes:**

1. **Application not starting**
   ```bash
   # Check for startup errors
   docker-compose -f docker-compose.production.yml logs api | grep -i error

   # Solution: Fix application errors, check environment variables
   ```

2. **Database connection failure**
   ```bash
   # Check MongoDB connection
   docker-compose -f docker-compose.production.yml logs api | grep -i mongo

   # Solution: Verify MONGO_URI in .env.production
   ```

3. **Port conflict**
   ```bash
   # Check if port 3000 is already in use
   sudo netstat -tlnp | grep 3000

   # Solution: Stop conflicting service or change PORT in .env.production
   ```

**Solution Steps:**
1. Review application logs
2. Verify environment variables
3. Test database connections manually
4. Restart services if needed

---

### Issue: Deployment script fails with permission denied

**Symptoms:**
```bash
./server/scripts/deploy.sh
bash: ./server/scripts/deploy.sh: Permission denied
```

**Solution:**
```bash
# Make scripts executable
chmod +x server/scripts/*.sh

# Commit and push
git add .
git commit -m "fix: Make deployment scripts executable"
git push
```

---

### Issue: Out of disk space on EC2

**Symptoms:**
```bash
Error: No space left on device
docker: Error response from daemon: no space left on device
```

**Diagnosis:**
```bash
# Check disk usage
df -h

# Check Docker disk usage
docker system df

# Find large files
du -h --max-depth=1 / | sort -hr | head -20
```

**Solution:**
```bash
# Clean up Docker resources
docker system prune -a -f --volumes

# Remove old log files
find /opt/chat-app/logs -name "*.log" -mtime +30 -delete

# Remove old backups
find /opt/chat-app/backups -mtime +7 -delete

# If still insufficient, increase EBS volume size
aws ec2 modify-volume --volume-id vol-xxxxx --size 30
# Then extend filesystem:
sudo growpart /dev/xvda 1
sudo resize2fs /dev/xvda1
```

---

## Docker Issues

### Issue: Docker containers keep restarting

**Symptoms:**
```bash
docker ps
# Shows containers with "Restarting" status
```

**Diagnosis:**
```bash
# Check container logs
docker logs <container_id>

# Check restart count
docker inspect <container_id> | grep RestartCount

# Check exit code
docker inspect <container_id> | grep ExitCode
```

**Common Causes:**

1. **Application crashes on startup**
   ```bash
   # View full logs
   docker logs --tail 200 <container_id>

   # Solution: Fix application bug or configuration error
   ```

2. **Health check failure**
   ```bash
   # Check health check configuration in docker-compose.yml
   # Increase timeout or adjust health check command

   # Solution: Update health check settings
   healthcheck:
     timeout: 30s  # Increase timeout
     retries: 5    # Increase retries
   ```

3. **Out of memory**
   ```bash
   # Check if OOM killed
   dmesg | grep -i "killed process"

   # Solution: Increase memory limits in docker-compose.yml
   deploy:
     resources:
       limits:
         memory: 2G  # Increase from 1G
   ```

---

### Issue: Cannot pull Docker images from ECR

**Symptoms:**
```bash
Error response from daemon: pull access denied
```

**Solution:**
```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Verify IAM permissions
aws ecr describe-repositories

# Check if instance profile has ECR permissions
aws sts get-caller-identity
```

---

## Database Connection Issues

### Issue: Cannot connect to MongoDB Atlas

**Symptoms:**
```bash
MongoNetworkError: failed to connect to server
MongoTimeoutError: Server selection timed out after 30000 ms
```

**Diagnosis:**
```bash
# Test connection from EC2
mongosh "mongodb+srv://cluster.xxxxx.mongodb.net/chatdb" --username chat-app-prod

# Check network connectivity
ping cluster.xxxxx.mongodb.net
curl -v telnet://cluster.xxxxx.mongodb.net:27017
```

**Common Causes:**

1. **IP not allowlisted**
   ```
   Solution:
   1. Get EC2 public IP: curl ifconfig.me
   2. MongoDB Atlas → Network Access → Add IP Address
   3. Add EC2 Elastic IP (not instance IP!)
   ```

2. **Incorrect connection string**
   ```bash
   # Check MONGO_URI in .env.production
   cat .env.production | grep MONGO_URI

   # Solution: Verify connection string format
   # mongodb+srv://username:password@cluster.xxxxx.mongodb.net/chatdb

   # URL encode special characters in password!
   # Example: p@ssw0rd → p%40ssw0rd
   ```

3. **Database user doesn't exist**
   ```
   Solution:
   1. MongoDB Atlas → Database Access
   2. Verify user exists and has readWrite permissions
   3. Check password is correct
   ```

4. **VPC Peering/Private Endpoint not configured**
   ```
   Solution:
   1. MongoDB Atlas → Network Access → Peering
   2. Follow VPC Peering setup guide
   ```

**Testing Connection:**
```bash
# Test with Node.js script
cat > test-mongo.js << 'EOF'
const { MongoClient } = require('mongodb');
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    await client.db("admin").command({ ping: 1 });
    console.log('✅ Ping successful');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  } finally {
    await client.close();
  }
}
run();
EOF

# Run test
source .env.production
node test-mongo.js
```

---

## Redis Connection Issues

### Issue: Cannot connect to ElastiCache Redis

**Symptoms:**
```bash
Error: connect ETIMEDOUT
Redis connection failed: Connection timeout
```

**Diagnosis:**
```bash
# Test Redis connection
redis-cli -h master.xxxxx.use1.cache.amazonaws.com -p 6379 ping
# Expected: PONG

# Check from EC2
telnet master.xxxxx.use1.cache.amazonaws.com 6379
```

**Common Causes:**

1. **Security group misconfiguration**
   ```bash
   # Check Redis security group allows port 6379 from EC2 security group
   aws ec2 describe-security-groups --group-ids $REDIS_SG_ID

   # Solution: Add inbound rule
   aws ec2 authorize-security-group-ingress \
     --group-id $REDIS_SG_ID \
     --protocol tcp \
     --port 6379 \
     --source-group $EC2_SG_ID
   ```

2. **Incorrect endpoint**
   ```bash
   # Verify Redis endpoint
   aws elasticache describe-cache-clusters \
     --cache-cluster-id chat-app-redis \
     --show-cache-node-info

   # Update REDIS_URL in .env.production
   REDIS_URL=redis://master.xxxxx.use1.cache.amazonaws.com:6379/0
   ```

3. **Redis not in same VPC/subnet**
   ```
   Solution: Recreate Redis in same VPC as EC2
   ```

---

## S3 Storage Issues

### Issue: Cannot upload files to S3

**Symptoms:**
```bash
AccessDenied: Access Denied
InvalidAccessKeyId: The AWS Access Key Id you provided does not exist
```

**Diagnosis:**
```bash
# Test S3 access from EC2
aws s3 ls s3://$BUCKET_NAME

# Test upload
echo "test" > test.txt
aws s3 cp test.txt s3://$BUCKET_NAME/test.txt
```

**Common Causes:**

1. **Invalid credentials**
   ```bash
   # Check credentials in .env.production
   cat .env.production | grep S3_

   # Verify credentials work
   aws configure set aws_access_key_id $S3_ACCESS_KEY
   aws configure set aws_secret_access_key $S3_SECRET_KEY
   aws s3 ls
   ```

2. **Bucket policy incorrect**
   ```bash
   # Check bucket policy
   aws s3api get-bucket-policy --bucket $BUCKET_NAME

   # Solution: Update IAM policy to allow PutObject, GetObject
   ```

3. **S3_ENDPOINT misconfiguration**
   ```bash
   # For AWS S3, S3_ENDPOINT must be empty!
   # Check .env.production:
   S3_ENDPOINT=        # Empty for AWS S3
   S3_USE_PATH_STYLE=false  # false for AWS S3

   # For MinIO (development only):
   S3_ENDPOINT=http://localhost:9000
   S3_USE_PATH_STYLE=true
   ```

---

### Issue: Files upload but return 403 when accessing

**Symptoms:**
- Upload succeeds
- Presigned URL returns 403 Forbidden

**Solution:**
```bash
# Update bucket policy to allow GetObject
cat > bucket-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
  }]
}
EOF

aws s3api put-bucket-policy --bucket $BUCKET_NAME --policy file://bucket-policy.json
```

---

## SSL/HTTPS Issues

### Issue: Let's Encrypt certificate not generated

**Symptoms:**
```bash
caddy logs show: could not get certificate from ACME server
```

**Diagnosis:**
```bash
# Check Caddy logs
docker-compose -f docker-compose.production.yml logs caddy

# Check if domain resolves to EC2
nslookup yourdomain.com
# Should return EC2 public IP

# Check if port 80 is accessible
curl -v http://yourdomain.com
```

**Common Causes:**

1. **DNS not pointing to EC2**
   ```bash
   # Verify DNS
   dig yourdomain.com +short
   # Should return EC2 Elastic IP

   # Solution: Update A record in DNS provider
   ```

2. **Port 80/443 blocked**
   ```bash
   # Check security group
   aws ec2 describe-security-groups --group-ids $SG_ID

   # Solution: Allow ports 80 and 443
   aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0
   aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0
   ```

3. **Caddyfile misconfigured**
   ```bash
   # Check Caddyfile
   cat caddy/Caddyfile

   # Should have domain, not :80, :443
   # Correct:
   # yourdomain.com {
   #   ...
   # }

   # Incorrect:
   # :80, :443 {
   #   ...
   # }
   ```

**Manual Certificate Renewal:**
```bash
# Force certificate renewal
docker exec <caddy_container_id> caddy reload --config /etc/caddy/Caddyfile
```

---

## Performance Issues

### Issue: High CPU usage

**Symptoms:**
```bash
top
# Shows API container using >80% CPU
```

**Diagnosis:**
```bash
# Check container stats
docker stats

# Profile Node.js application
docker exec -it <api_container_id> node --prof /app/dist/main.js
```

**Solutions:**

1. **Increase instance size**
   ```bash
   # Stop instance
   aws ec2 stop-instances --instance-ids $INSTANCE_ID

   # Change instance type
   aws ec2 modify-instance-attribute \
     --instance-id $INSTANCE_ID \
     --instance-type t3.large

   # Start instance
   aws ec2 start-instances --instance-ids $INSTANCE_ID
   ```

2. **Scale horizontally**
   ```
   Deploy multiple EC2 instances with load balancer
   ```

3. **Optimize application code**
   ```
   Review N+1 queries, implement caching, optimize algorithms
   ```

---

### Issue: High memory usage

**Symptoms:**
```bash
free -h
# Shows low available memory

docker stats
# Shows container using >90% memory
```

**Solution:**
```bash
# Increase container memory limit in docker-compose.production.yml
deploy:
  resources:
    limits:
      memory: 4G  # Increase from 2G

# Restart containers
docker-compose -f docker-compose.production.yml up -d

# Or increase EC2 instance memory (change instance type)
```

---

### Issue: Slow database queries

**Symptoms:**
- API responds slowly
- High MongoDB CPU usage

**Diagnosis:**
```bash
# Check slow queries in MongoDB Atlas
# Atlas → Performance → Query Performance

# Check if indexes are being used
# Atlas → Performance → Query Performance → Index Suggestions
```

**Solution:**
```bash
# Run index creation script
cd /opt/chat-app/server
npx ts-node scripts/create-indexes.ts

# Verify indexes
mongosh "mongodb+srv://..." --eval "db.messages.getIndexes()"
```

---

## CI/CD Pipeline Issues

### Issue: GitHub Actions workflow fails at "Deploy to EC2"

**Symptoms:**
```
Error: Connection timed out
Error: Permission denied (publickey)
```

**Solutions:**

1. **SSH connection timeout**
   ```
   - Verify EC2_HOST in GitHub Secrets is correct
   - Verify security group allows port 22 from GitHub Actions IPs
   - Use Elastic IP instead of instance public IP
   ```

2. **SSH key mismatch**
   ```
   - Verify EC2_SSH_PRIVATE_KEY secret contains entire key
   - Includes -----BEGIN RSA PRIVATE KEY----- header
   - No extra spaces or line breaks
   ```

3. **GitHub Actions IP blocked**
   ```bash
   # Allow GitHub Actions IP ranges
   # Get current IPs: https://api.github.com/meta
   curl https://api.github.com/meta | jq '.actions'

   # Option 1: Allow all (not recommended)
   aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr 0.0.0.0/0

   # Option 2: Use self-hosted runner on EC2
   ```

---

### Issue: ECR push fails

**Symptoms:**
```
Error: denied: Your authorization token has expired
Error: no basic auth credentials
```

**Solution:**
```bash
# Verify AWS credentials in GitHub Secrets
# - AWS_ACCESS_KEY_ID
# - AWS_SECRET_ACCESS_KEY
# - AWS_ACCOUNT_ID

# Verify IAM user has ECR permissions
aws iam get-user-policy --user-name github-actions-deployer --policy-name ECRPushAccess

# Recreate access keys if expired
aws iam create-access-key --user-name github-actions-deployer
```

---

## Emergency Procedures

### Complete System Failure

If the system is completely down:

```bash
# 1. Check if EC2 is running
aws ec2 describe-instances --instance-ids $INSTANCE_ID

# 2. If stopped, start it
aws ec2 start-instances --instance-ids $INSTANCE_ID

# 3. SSH and check containers
ssh -i ~/.ssh/chat-app-key.pem ubuntu@$EC2_HOST
docker ps -a

# 4. Restart all services
cd /opt/chat-app
docker-compose -f docker-compose.production.yml restart

# 5. If data corruption, restore from backup
./server/scripts/rollback.sh
```

---

### Data Loss Recovery

See [Recovery Playbook](../server/docs/RECOVERY_PLAYBOOK.md) for detailed procedures:
- MongoDB PITR recovery
- Redis AOF recovery
- S3 versioning recovery

---

## Getting Help

### Log Collection

Collect these logs when reporting issues:

```bash
# Application logs
docker-compose -f docker-compose.production.yml logs --tail=200 > logs.txt

# System logs
journalctl -u docker -n 200 >> logs.txt

# Deployment logs
cat /opt/chat-app/logs/deploy_*.log >> logs.txt

# Environment (redact secrets!)
cat .env.production | sed 's/=.*/=***/' >> logs.txt
```

### Support Channels

1. **Project Issues**: Create GitHub Issue with logs
2. **AWS Support**: https://console.aws.amazon.com/support/
3. **MongoDB Atlas Support**: https://support.mongodb.com/
4. **Emergency**: Check [Recovery Playbook](../server/docs/RECOVERY_PLAYBOOK.md)

---

## Prevention Checklist

- ✅ Monitoring enabled (CloudWatch, logs)
- ✅ Alerts configured (CPU, memory, errors)
- ✅ Backups automated and tested
- ✅ Health checks configured
- ✅ Rollback procedure documented and tested
- ✅ On-call rotation established
- ✅ Disaster recovery tested quarterly

---

## Related Documentation

- [AWS Deployment Guide](./AWS_DEPLOYMENT_GUIDE.md)
- [EC2 Setup Guide](./EC2_SETUP_GUIDE.md)
- [CI/CD Setup Guide](./CICD_SETUP_GUIDE.md)
- [Recovery Playbook](../server/docs/RECOVERY_PLAYBOOK.md)
- [Operational Checklist](../server/docs/OPERATIONAL_CHECKLIST.md)

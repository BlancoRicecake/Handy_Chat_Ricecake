#!/bin/bash

###############################################################################
# EC2 MVP Setup Automation Script
###############################################################################
#
# This script automates the complete setup of MVP environment on EC2
#
# Usage:
#   1. SSH into your EC2 instance
#   2. Download this script: curl -o setup-mvp.sh [URL]
#   3. chmod +x setup-mvp.sh
#   4. ./setup-mvp.sh
#
# What it does:
#   - Installs Docker & Docker Compose
#   - Clones/uploads your project
#   - Generates environment variables
#   - Creates MongoDB indexes
#   - Configures Caddyfile for IP access
#   - Deploys MVP stack
#   - Runs health checks
#
###############################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
PROJECT_DIR="/opt/chat-app"
LOG_FILE="/tmp/mvp-setup-$(date +%Y%m%d_%H%M%S).log"

###############################################################################
# Helper Functions
###############################################################################

log() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

prompt() {
    echo -e "${CYAN}[PROMPT]${NC} $1"
}

banner() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
}

confirm() {
    local message=$1
    read -p "$(echo -e ${YELLOW}$message ${NC}[y/N]: )" response
    [[ "$response" =~ ^[Yy]$ ]]
}

###############################################################################
# Pre-flight Checks
###############################################################################

check_prerequisites() {
    banner "Pre-flight Checks"

    # Check if running as root
    if [ "$EUID" -eq 0 ]; then
        error "Please do not run this script as root"
        exit 1
    fi

    # Check Ubuntu
    if ! grep -q "Ubuntu" /etc/os-release; then
        warning "This script is designed for Ubuntu. Proceed with caution."
    fi

    # Check internet connection
    if ! ping -c 1 google.com &> /dev/null; then
        error "No internet connection"
        exit 1
    fi

    # Get EC2 public IP
    EC2_PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 || curl -s ifconfig.me)
    log "Detected Public IP: $EC2_PUBLIC_IP"

    success "Pre-flight checks passed"
}

###############################################################################
# System Updates
###############################################################################

update_system() {
    banner "System Update"

    log "Updating package lists..."
    sudo apt-get update >> "$LOG_FILE" 2>&1

    log "Upgrading packages (this may take a while)..."
    sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y >> "$LOG_FILE" 2>&1

    log "Installing essential tools..."
    sudo apt-get install -y curl wget git jq >> "$LOG_FILE" 2>&1

    success "System updated successfully"
}

###############################################################################
# Docker Installation
###############################################################################

install_docker() {
    banner "Docker Installation"

    # Check if Docker is already installed
    if command -v docker &> /dev/null; then
        log "Docker is already installed"
        docker --version
    else
        log "Installing Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh >> "$LOG_FILE" 2>&1
        rm get-docker.sh

        log "Adding user to docker group..."
        sudo usermod -aG docker $USER

        success "Docker installed successfully"
        warning "You may need to log out and log back in for group changes to take effect"
    fi

    # Check if Docker Compose is installed
    if command -v docker-compose &> /dev/null; then
        log "Docker Compose is already installed"
        docker-compose --version
    else
        log "Installing Docker Compose..."
        sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose >> "$LOG_FILE" 2>&1
        sudo chmod +x /usr/local/bin/docker-compose

        success "Docker Compose installed successfully"
    fi

    # Verify installations
    newgrp docker << EONG
        docker --version
        docker-compose --version
EONG
}

###############################################################################
# Project Setup
###############################################################################

setup_project() {
    banner "Project Setup"

    # Create project directory
    log "Creating project directory: $PROJECT_DIR"
    sudo mkdir -p "$PROJECT_DIR"
    sudo chown $USER:$USER "$PROJECT_DIR"

    cd "$PROJECT_DIR"

    # Ask for setup method
    echo ""
    prompt "How would you like to get the project code?"
    echo "  1. Clone from GitHub repository"
    echo "  2. I will upload files manually (via SCP)"
    echo ""
    read -p "Enter your choice [1/2]: " setup_choice

    case $setup_choice in
        1)
            prompt "Enter your GitHub repository URL (e.g., https://github.com/user/repo.git):"
            read -p "> " repo_url

            if [ -z "$repo_url" ]; then
                error "Repository URL cannot be empty"
                exit 1
            fi

            log "Cloning repository..."
            git clone "$repo_url" . >> "$LOG_FILE" 2>&1
            success "Repository cloned successfully"
            ;;
        2)
            log "Please upload your project files to $PROJECT_DIR using:"
            echo ""
            echo -e "${CYAN}  scp -i your-key.pem -r /path/to/project/* ubuntu@$EC2_PUBLIC_IP:$PROJECT_DIR/${NC}"
            echo ""
            prompt "Press ENTER when upload is complete..."
            read

            # Verify files exist
            if [ ! -f "docker-compose.mvp.yml" ]; then
                error "docker-compose.mvp.yml not found. Please upload project files first."
                exit 1
            fi
            success "Project files detected"
            ;;
        *)
            error "Invalid choice"
            exit 1
            ;;
    esac

    # Verify project structure
    if [ ! -f "docker-compose.mvp.yml" ]; then
        error "docker-compose.mvp.yml not found!"
        exit 1
    fi

    success "Project setup complete"
}

###############################################################################
# Environment Configuration
###############################################################################

setup_environment() {
    banner "Environment Configuration"

    cd "$PROJECT_DIR"

    # Check if .env.mvp already exists
    if [ -f ".env.mvp" ]; then
        if confirm ".env.mvp already exists. Overwrite?"; then
            mv .env.mvp .env.mvp.backup.$(date +%s)
            log "Backed up existing .env.mvp"
        else
            log "Using existing .env.mvp"
            return
        fi
    fi

    # Generate JWT secret
    prompt "Generating JWT secret..."
    JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
    log "JWT secret generated (64 characters)"

    # Create .env.mvp from template
    if [ -f ".env.mvp.example" ]; then
        log "Creating .env.mvp from template..."
        cp .env.mvp.example .env.mvp

        # Replace placeholders
        sed -i "s|JWT_SECRET_CURRENT=.*|JWT_SECRET_CURRENT=$JWT_SECRET|" .env.mvp
        sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=http://$EC2_PUBLIC_IP,http://localhost:3000|" .env.mvp

        success ".env.mvp created successfully"
    else
        warning ".env.mvp.example not found. Creating minimal .env.mvp..."

        cat > .env.mvp << EOF
# Auto-generated by setup script
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
TRUST_PROXY=1

# Local services
MONGO_URI=mongodb://mongo:27017/chatdb
REDIS_URL=redis://redis:6379/0

# JWT
JWT_SECRET_CURRENT=$JWT_SECRET
JWT_SECRET_PREVIOUS=
ACCESS_TOKEN_EXPIRY=7d
REFRESH_TOKEN_EXPIRY=7d
JWT_CLOCK_TOLERANCE=60

# Feature Flags
USE_ROTATED_JWT=false
ENABLE_REFRESH_TOKEN=false
ENFORCE_SINGLE_SESSION=false
USE_AWS_SECRETS=false
AWS_SECRETS_FAIL_OPEN=false

# CORS
CORS_ORIGIN=http://$EC2_PUBLIC_IP,http://localhost:3000

# Logging
LOG_LEVEL=info

# S3 (Disabled for MVP)
USE_S3=false
EOF
        success "Minimal .env.mvp created"
    fi

    # Set secure permissions
    chmod 600 .env.mvp
    log "Set .env.mvp permissions to 600"

    success "Environment configuration complete"
}

###############################################################################
# Caddyfile Configuration (IP Mode)
###############################################################################

configure_caddyfile() {
    banner "Caddyfile Configuration"

    cd "$PROJECT_DIR"

    if [ ! -f "caddy/Caddyfile" ]; then
        warning "caddy/Caddyfile not found"
        return
    fi

    log "Configuring Caddyfile for IP access (HTTP only)..."

    # Backup original
    cp caddy/Caddyfile caddy/Caddyfile.backup

    # Create IP-mode Caddyfile
    cat > caddy/Caddyfile << 'EOF'
:80 {
    # Rate limiting
    rate_limit {
        zone dynamic {
            key {remote_host}
            events 100
            window 1m
        }
    }

    # Reverse proxy to API
    reverse_proxy api:3000 {
        health_uri /health
        health_interval 30s
        health_timeout 10s
    }

    # Security headers
    header {
        -Server
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
    }

    # Logging
    log {
        output file /var/log/caddy/access.log
        format json
    }
}
EOF

    success "Caddyfile configured for IP access (port 80)"
    log "To enable HTTPS with domain later, see docs/deployment/MVP_DEPLOYMENT_GUIDE.md"
}

###############################################################################
# MongoDB Index Creation
###############################################################################

create_mongodb_indexes() {
    banner "MongoDB Index Creation"

    cd "$PROJECT_DIR"

    # Check if create-indexes script exists
    if [ ! -f "server/scripts/create-indexes.ts" ]; then
        warning "create-indexes.ts not found. Skipping index creation."
        return
    fi

    # Install Node.js temporarily
    log "Installing Node.js (temporary, for index creation)..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >> "$LOG_FILE" 2>&1
    sudo apt-get install -y nodejs >> "$LOG_FILE" 2>&1

    # Install dependencies
    log "Installing server dependencies..."
    cd server
    npm ci >> "$LOG_FILE" 2>&1

    # Start MongoDB container temporarily
    cd "$PROJECT_DIR"
    log "Starting MongoDB container..."
    docker-compose -f docker-compose.mvp.yml up -d mongo >> "$LOG_FILE" 2>&1

    # Wait for MongoDB to be ready
    log "Waiting for MongoDB to be ready..."
    sleep 10

    # Create indexes
    log "Creating MongoDB indexes..."
    cd server
    npx ts-node scripts/create-indexes.ts >> "$LOG_FILE" 2>&1

    success "MongoDB indexes created successfully"

    # Stop MongoDB for now
    cd "$PROJECT_DIR"
    docker-compose -f docker-compose.mvp.yml stop mongo >> "$LOG_FILE" 2>&1
}

###############################################################################
# MVP Deployment
###############################################################################

deploy_mvp() {
    banner "MVP Deployment"

    cd "$PROJECT_DIR"

    # Make deploy script executable
    if [ -f "server/scripts/deploy-mvp.sh" ]; then
        chmod +x server/scripts/deploy-mvp.sh
        log "Deploy script is executable"
    fi

    log "Pulling base images..."
    docker-compose -f docker-compose.mvp.yml pull mongo redis >> "$LOG_FILE" 2>&1

    log "Building and starting containers..."
    docker-compose -f docker-compose.mvp.yml up -d --build >> "$LOG_FILE" 2>&1

    log "Waiting for services to start..."
    sleep 15

    success "MVP deployment complete"
}

###############################################################################
# Health Check
###############################################################################

verify_deployment() {
    banner "Health Check"

    log "Checking container status..."
    docker-compose -f "$PROJECT_DIR/docker-compose.mvp.yml" ps

    log "Waiting for health checks to pass..."
    sleep 10

    # Test health endpoint
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if curl -sf http://localhost/health > /dev/null 2>&1; then
            success "Health check passed!"

            # Get health check response
            health_response=$(curl -s http://localhost/health)
            log "Health response: $health_response"

            return 0
        fi

        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done

    echo ""
    error "Health check failed after $max_attempts attempts"

    log "Checking logs..."
    docker-compose -f "$PROJECT_DIR/docker-compose.mvp.yml" logs --tail=50 api

    return 1
}

###############################################################################
# Setup Automatic Backup
###############################################################################

setup_backup() {
    banner "Backup Configuration"

    if ! confirm "Setup automatic daily backups?"; then
        log "Skipping backup setup"
        return
    fi

    cd "$PROJECT_DIR"

    # Create backup script
    cat > backup.sh << 'EOF'
#!/bin/bash
set -e

BACKUP_DIR=/opt/chat-app/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup MongoDB
docker exec $(docker ps -qf "name=mongo") \
  mongodump --quiet --out=/tmp/backup_$TIMESTAMP

docker cp $(docker ps -qf "name=mongo"):/tmp/backup_$TIMESTAMP \
  $BACKUP_DIR/mongo_$TIMESTAMP

# Backup environment
cp /opt/chat-app/.env.mvp $BACKUP_DIR/.env.mvp.$TIMESTAMP

# Keep last 7 days
find $BACKUP_DIR -name "mongo_*" -mtime +7 -exec rm -rf {} \; 2>/dev/null || true
find $BACKUP_DIR -name ".env.mvp.*" -mtime +7 -delete 2>/dev/null || true

echo "Backup completed: $TIMESTAMP"
EOF

    chmod +x backup.sh

    # Add to crontab
    (crontab -l 2>/dev/null || true; echo "0 2 * * * $PROJECT_DIR/backup.sh >> $PROJECT_DIR/logs/backup.log 2>&1") | crontab -

    success "Automatic backups configured (daily at 2 AM)"
}

###############################################################################
# Final Summary
###############################################################################

show_summary() {
    banner "Setup Complete!"

    echo -e "${GREEN}✅ MVP environment successfully deployed!${NC}"
    echo ""
    echo -e "${CYAN}Access Information:${NC}"
    echo -e "  Health Check: ${GREEN}http://$EC2_PUBLIC_IP/health${NC}"
    echo -e "  API Endpoint: ${GREEN}http://$EC2_PUBLIC_IP${NC}"
    echo -e "  WebSocket:    ${GREEN}ws://$EC2_PUBLIC_IP${NC}"
    echo ""
    echo -e "${CYAN}Useful Commands:${NC}"
    echo -e "  View logs:    ${YELLOW}cd $PROJECT_DIR && docker-compose -f docker-compose.mvp.yml logs -f${NC}"
    echo -e "  Restart:      ${YELLOW}cd $PROJECT_DIR && docker-compose -f docker-compose.mvp.yml restart${NC}"
    echo -e "  Stop:         ${YELLOW}cd $PROJECT_DIR && docker-compose -f docker-compose.mvp.yml down${NC}"
    echo -e "  Status:       ${YELLOW}cd $PROJECT_DIR && docker-compose -f docker-compose.mvp.yml ps${NC}"
    echo -e "  Resources:    ${YELLOW}docker stats${NC}"
    echo ""
    echo -e "${CYAN}Next Steps:${NC}"
    echo -e "  1. Test your application: ${GREEN}http://$EC2_PUBLIC_IP/health${NC}"
    echo -e "  2. (Optional) Connect domain and enable HTTPS"
    echo -e "  3. Review: ${YELLOW}$PROJECT_DIR/docs/deployment/MVP_DEPLOYMENT_GUIDE.md${NC}"
    echo -e "  4. Scaling guide: ${YELLOW}$PROJECT_DIR/docs/deployment/SCALING_ROADMAP.md${NC}"
    echo ""
    echo -e "${CYAN}Log file:${NC} $LOG_FILE"
    echo ""
}

###############################################################################
# Main Execution
###############################################################################

main() {
    clear

    cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║             MVP Chat Application Setup Script                ║
║                                                               ║
║           Automated EC2 Environment Configuration            ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF

    echo ""
    log "Starting MVP setup..."
    log "Log file: $LOG_FILE"
    echo ""

    # Execute setup steps
    check_prerequisites

    if confirm "Update system packages? (Recommended)"; then
        update_system
    else
        log "Skipping system update"
    fi

    install_docker
    setup_project
    setup_environment
    configure_caddyfile

    if confirm "Create MongoDB indexes now?"; then
        create_mongodb_indexes
    else
        warning "MongoDB indexes not created. You can create them later."
    fi

    deploy_mvp

    if verify_deployment; then
        setup_backup
        show_summary
        exit 0
    else
        error "Deployment verification failed. Check logs at $LOG_FILE"
        exit 1
    fi
}

# Trap errors
trap 'error "Script failed at line $LINENO"' ERR

# Run main function
main "$@"

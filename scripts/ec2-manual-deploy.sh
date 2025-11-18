#!/bin/bash

###############################################################################
# EC2 Manual Deployment Script
###############################################################################
# This script performs complete MVP deployment on EC2
# No user interaction required - fully automated
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

###############################################################################
# Helper Functions
###############################################################################

log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

banner() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
}

###############################################################################
# Main Deployment Steps
###############################################################################

main() {
    banner "EC2 MVP Deployment - Automated"

    log "Starting deployment process..."
    log "Project directory: $PROJECT_DIR"
    echo ""

    # Step 1: Verify project files
    banner "Step 1: Verifying Project Files"

    if [ ! -d "$PROJECT_DIR" ]; then
        error "Project directory not found: $PROJECT_DIR"
        error "Please upload project files first"
        exit 1
    fi

    cd "$PROJECT_DIR"

    if [ ! -f "docker-compose.mvp.yml" ]; then
        error "docker-compose.mvp.yml not found!"
        exit 1
    fi

    success "Project files verified"

    # Step 2: Setup environment variables
    banner "Step 2: Environment Configuration"

    if [ -f ".env.mvp" ]; then
        log "Found existing .env.mvp - keeping it"
    else
        log "Creating .env.mvp..."

        if [ ! -f ".env.mvp.example" ]; then
            error ".env.mvp.example not found!"
            exit 1
        fi

        cp .env.mvp.example .env.mvp

        # Generate JWT secret
        log "Generating JWT secret..."
        JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
        sed -i "s|JWT_SECRET_CURRENT=.*|JWT_SECRET_CURRENT=$JWT_SECRET|" .env.mvp

        # Set CORS origin with EC2 IP
        log "Detecting EC2 public IP..."
        EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 || curl -s ifconfig.me)
        log "EC2 Public IP: $EC2_IP"
        sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=http://$EC2_IP,http://localhost:3000|" .env.mvp

        # Set secure permissions
        chmod 600 .env.mvp

        success ".env.mvp created successfully"
    fi

    # Step 3: Configure Caddyfile for IP access
    banner "Step 3: Caddyfile Configuration"

    if [ -f "caddy/Caddyfile" ]; then
        log "Configuring Caddyfile for IP access (HTTP only)..."

        # Backup original
        cp caddy/Caddyfile caddy/Caddyfile.backup 2>/dev/null || true

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
        success "Caddyfile configured for IP access"
    else
        error "caddy/Caddyfile not found!"
        exit 1
    fi

    # Step 4: Create MongoDB indexes
    banner "Step 4: MongoDB Index Creation"

    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log "Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        log "Node.js already installed: $(node --version)"
    fi

    # Check if server dependencies are installed
    if [ ! -d "server/node_modules" ]; then
        log "Installing server dependencies..."
        cd server
        npm ci
        cd ..
        success "Dependencies installed"
    else
        log "Server dependencies already installed"
    fi

    # Start MongoDB container
    log "Starting MongoDB container..."
    docker-compose -f docker-compose.mvp.yml up -d mongo

    log "Waiting for MongoDB to be ready (10 seconds)..."
    sleep 10

    # Create indexes
    log "Creating MongoDB indexes..."
    cd server
    npx ts-node scripts/create-indexes.ts
    cd ..

    success "MongoDB indexes created"

    # Stop MongoDB (will restart with full stack)
    docker-compose -f docker-compose.mvp.yml stop mongo

    # Step 5: Deploy MVP stack
    banner "Step 5: MVP Deployment"

    log "Pulling base images..."
    docker-compose -f docker-compose.mvp.yml pull mongo redis 2>/dev/null || true

    log "Building and starting all containers..."
    docker-compose -f docker-compose.mvp.yml up -d --build

    log "Waiting for services to start (15 seconds)..."
    sleep 15

    success "Containers started"

    # Step 6: Health check
    banner "Step 6: Health Check"

    log "Container status:"
    docker-compose -f docker-compose.mvp.yml ps

    echo ""
    log "Waiting for health checks to pass..."

    max_attempts=30
    attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if curl -sf http://localhost/health > /dev/null 2>&1; then
            success "Health check passed!"

            health_response=$(curl -s http://localhost/health)
            echo ""
            log "Health response: $health_response"
            echo ""

            # Get EC2 IP for final message
            EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 || echo "localhost")

            banner "Deployment Complete!"

            echo -e "${GREEN}✅ MVP environment successfully deployed!${NC}"
            echo ""
            echo -e "${CYAN}Access Information:${NC}"
            echo -e "  Health Check: ${GREEN}http://$EC2_IP/health${NC}"
            echo -e "  API Endpoint: ${GREEN}http://$EC2_IP${NC}"
            echo -e "  WebSocket:    ${GREEN}ws://$EC2_IP${NC}"
            echo ""
            echo -e "${CYAN}Useful Commands:${NC}"
            echo -e "  View logs:    ${YELLOW}docker-compose -f $PROJECT_DIR/docker-compose.mvp.yml logs -f${NC}"
            echo -e "  Restart:      ${YELLOW}docker-compose -f $PROJECT_DIR/docker-compose.mvp.yml restart${NC}"
            echo -e "  Stop:         ${YELLOW}docker-compose -f $PROJECT_DIR/docker-compose.mvp.yml down${NC}"
            echo -e "  Status:       ${YELLOW}docker-compose -f $PROJECT_DIR/docker-compose.mvp.yml ps${NC}"
            echo ""

            exit 0
        fi

        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done

    echo ""
    error "Health check failed after $max_attempts attempts"

    log "Checking logs..."
    docker-compose -f docker-compose.mvp.yml logs --tail=50 api

    exit 1
}

# Trap errors
trap 'error "Script failed at line $LINENO"' ERR

# Run main function
main "$@"

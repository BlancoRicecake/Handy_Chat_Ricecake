#!/bin/bash

###############################################################################
# Staging Deployment Script
###############################################################################
# Deployment script for EC2 Spot staging environment
#
# Usage:
#   ./server/scripts/deploy-staging.sh [OPTIONS]
#
# Options:
#   --no-pull       Skip git pull (use existing code)
#   --no-backup     Skip backup of current deployment
#   --help          Show this help message
#
# Prerequisites:
#   - .env.staging file configured
#   - Docker and Docker Compose installed
#   - Git configured with deploy key
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ROOT="/opt/chat-staging"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.local-staging.yml"
ENV_FILE="$PROJECT_ROOT/.env.staging"
BACKUP_DIR="$PROJECT_ROOT/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Options
NO_PULL=false
NO_BACKUP=false

###############################################################################
# Helper Functions
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    cat << EOF
Staging Deployment Script

Usage: ./server/scripts/deploy-staging.sh [OPTIONS]

Options:
  --no-pull       Skip git pull (use existing code)
  --no-backup     Skip backup of current deployment
  --help          Show this help message

Examples:
  ./server/scripts/deploy-staging.sh                    # Full deployment
  ./server/scripts/deploy-staging.sh --no-pull          # Deploy without pulling
  ./server/scripts/deploy-staging.sh --no-backup        # Deploy without backup

EOF
}

###############################################################################
# Pre-deployment Checks
###############################################################################

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi

    # Check env file
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Environment file not found: $ENV_FILE"
        log_error "Copy .env.staging.example to .env.staging and configure it"
        exit 1
    fi

    # Check if JWT secret has been changed
    if grep -q "CHANGE_THIS" "$ENV_FILE"; then
        log_warning "JWT_SECRET_CURRENT appears to be default value"
        log_warning "Make sure to set a strong random secret!"
    fi

    log_success "All prerequisites met"
}

###############################################################################
# Pull Latest Code
###############################################################################

pull_latest_code() {
    if [ "$NO_PULL" = true ]; then
        log_info "Skipping git pull (--no-pull flag set)"
        return
    fi

    log_info "Pulling latest code from develop branch..."

    cd "$PROJECT_ROOT"

    # Check if git repository
    if [ ! -d ".git" ]; then
        log_warning "Not a git repository, skipping pull"
        return
    fi

    # Pull latest changes from develop
    if git pull origin develop; then
        log_success "Code updated successfully"
    else
        log_error "Failed to pull latest code"
        log_error "Fix conflicts manually and run again with --no-pull"
        exit 1
    fi
}

###############################################################################
# Backup Current State
###############################################################################

backup_current_state() {
    if [ "$NO_BACKUP" = true ]; then
        log_info "Skipping backup (--no-backup flag set)"
        return
    fi

    log_info "Creating backup..."

    mkdir -p "$BACKUP_DIR"

    # Backup environment file
    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "$BACKUP_DIR/.env.staging.${TIMESTAMP}"
        log_success "Environment file backed up"
    fi

    # Backup MongoDB data (if container is running)
    if docker ps -q -f "name=mongo" &> /dev/null; then
        log_info "Backing up MongoDB data..."
        docker exec $(docker ps -qf "name=mongo") mongodump --db=chatdb_stage --out=/tmp/backup_${TIMESTAMP} --quiet || log_warning "MongoDB backup failed (container may not be running)"
        docker cp $(docker ps -qf "name=mongo"):/tmp/backup_${TIMESTAMP} "$BACKUP_DIR/mongo_${TIMESTAMP}" 2>/dev/null || true
    fi

    # Keep only last 7 backups
    find "$BACKUP_DIR" -name "mongo_*" -mtime +7 -exec rm -rf {} \; 2>/dev/null || true
    find "$BACKUP_DIR" -name ".env.staging.*" -mtime +7 -delete 2>/dev/null || true

    log_success "Backup completed"
}

###############################################################################
# Deploy Application
###############################################################################

deploy_application() {
    log_info "Deploying application..."

    cd "$PROJECT_ROOT"

    # Pull latest images (for base images like mongo, redis)
    log_info "Pulling base images..."
    docker compose -f "$COMPOSE_FILE" pull mongo redis || true

    # Build and restart services
    log_info "Building and restarting services..."
    if docker compose -f "$COMPOSE_FILE" up -d --build; then
        log_success "Services deployed successfully"
    else
        log_error "Deployment failed"
        exit 1
    fi

    # Wait for services to start
    log_info "Waiting for services to initialize..."
    sleep 15
}

###############################################################################
# Health Check
###############################################################################

verify_deployment() {
    log_info "Verifying deployment..."

    # Check if containers are running
    local running=$(docker compose -f "$COMPOSE_FILE" ps -q | wc -l)
    local expected=4  # caddy, api, mongo, redis

    if [ "$running" -lt "$expected" ]; then
        log_error "Not all containers are running ($running/$expected)"
        docker compose -f "$COMPOSE_FILE" ps
        exit 1
    fi

    # Wait for health checks
    log_info "Waiting for health checks to pass..."
    sleep 10

    # Test health endpoint
    local max_attempts=30
    local attempt=0
    local health_ok=false

    while [ $attempt -lt $max_attempts ]; do
        if curl -sf http://localhost/health > /dev/null 2>&1; then
            health_ok=true
            break
        fi
        attempt=$((attempt + 1))
        sleep 2
    done

    if [ "$health_ok" = false ]; then
        log_error "Health check failed after ${max_attempts} attempts"
        log_error "Check logs: docker compose -f $COMPOSE_FILE logs api"
        exit 1
    fi

    log_success "Health check passed"
}

###############################################################################
# Show Status
###############################################################################

show_status() {
    log_info "Checking deployment status..."

    echo ""
    echo "Container Status:"
    docker compose -f "$COMPOSE_FILE" ps

    echo ""
    echo "Resource Usage:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

    echo ""
    echo "Recent Logs (last 10 lines):"
    docker compose -f "$COMPOSE_FILE" logs --tail=10 api
}

###############################################################################
# Cleanup
###############################################################################

cleanup_docker() {
    log_info "Cleaning up old Docker resources..."

    # Remove dangling images
    docker image prune -f || true

    log_success "Cleanup completed"
}

###############################################################################
# Main Deployment Flow
###############################################################################

main() {
    log_info "========================================="
    log_info "Starting Staging Deployment"
    log_info "Timestamp: $TIMESTAMP"
    log_info "========================================="

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-pull)
                NO_PULL=true
                shift
                ;;
            --no-backup)
                NO_BACKUP=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # Execute deployment steps
    check_prerequisites
    pull_latest_code
    backup_current_state
    deploy_application
    verify_deployment
    cleanup_docker
    show_status

    log_success "========================================="
    log_success "Staging Deployment Completed Successfully!"
    log_success "========================================="
    log_info ""
    log_info "Check logs: docker compose -f $COMPOSE_FILE logs -f"
    log_info "Monitor resources: docker stats"
    log_info ""
}

# Run main function
main "$@"

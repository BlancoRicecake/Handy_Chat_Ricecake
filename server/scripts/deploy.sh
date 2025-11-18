#!/bin/bash

###############################################################################
# Production Deployment Script
###############################################################################
# This script automates the deployment of the chat application to production
#
# Usage:
#   ./scripts/deploy.sh [OPTIONS]
#
# Options:
#   --skip-build    Skip Docker image build (use existing images)
#   --no-backup     Skip backup of current deployment
#   --help          Show this help message
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - .env.production file configured
#   - AWS credentials configured (if using ECR)
#
# Related Docs:
#   - docs/deployment/AWS_DEPLOYMENT_GUIDE.md
#   - docs/deployment/EC2_SETUP_GUIDE.md
###############################################################################

set -euo pipefail  # Exit on error, undefined variables, and pipe failures

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.production.yml"
ENV_FILE="$PROJECT_ROOT/.env.production"
BACKUP_DIR="$PROJECT_ROOT/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$PROJECT_ROOT/logs/deploy_${TIMESTAMP}.log"

# Options
SKIP_BUILD=false
NO_BACKUP=false

###############################################################################
# Helper Functions
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

show_help() {
    cat << EOF
Production Deployment Script

Usage: ./scripts/deploy.sh [OPTIONS]

Options:
  --skip-build    Skip Docker image build (use existing images)
  --no-backup     Skip backup of current deployment
  --help          Show this help message

Examples:
  ./scripts/deploy.sh                    # Full deployment with build
  ./scripts/deploy.sh --skip-build       # Quick deployment without rebuild
  ./scripts/deploy.sh --no-backup        # Deploy without backing up

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
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi

    # Check compose file
    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "Compose file not found: $COMPOSE_FILE"
        exit 1
    fi

    # Check env file
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Environment file not found: $ENV_FILE"
        log_error "Copy .env.production.example to .env.production and configure it"
        exit 1
    fi

    # Check if running as root
    if [ "$EUID" -eq 0 ]; then
        log_warning "Running as root. Consider using a non-root user with Docker permissions"
    fi

    log_success "All prerequisites met"
}

###############################################################################
# Backup Current Deployment
###############################################################################

backup_deployment() {
    if [ "$NO_BACKUP" = true ]; then
        log_info "Skipping backup (--no-backup flag set)"
        return
    fi

    log_info "Creating backup of current deployment..."

    # Create backup directory
    mkdir -p "$BACKUP_DIR"

    # Export current Docker images
    log_info "Exporting current images..."
    docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "chat-(api|caddy)" > "$BACKUP_DIR/images_${TIMESTAMP}.txt" || true

    # Backup environment file
    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "$BACKUP_DIR/.env.production.${TIMESTAMP}"
        log_success "Environment file backed up"
    fi

    # Backup volumes (optional, can be large)
    # log_info "Backing up Docker volumes..."
    # docker run --rm -v caddy-data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/caddy-data_${TIMESTAMP}.tar.gz /data

    log_success "Backup completed: $BACKUP_DIR"
}

###############################################################################
# Build Docker Images
###############################################################################

build_images() {
    if [ "$SKIP_BUILD" = true ]; then
        log_info "Skipping build (--skip-build flag set)"
        return
    fi

    log_info "Building Docker images..."

    cd "$PROJECT_ROOT"

    # Build with no cache for production
    if docker-compose -f "$COMPOSE_FILE" build --no-cache; then
        log_success "Docker images built successfully"
    else
        log_error "Docker build failed"
        exit 1
    fi
}

###############################################################################
# Deploy Application
###############################################################################

deploy_application() {
    log_info "Deploying application..."

    cd "$PROJECT_ROOT"

    # Pull any external images
    log_info "Pulling external images..."
    docker-compose -f "$COMPOSE_FILE" pull || true

    # Stop old containers (graceful shutdown)
    log_info "Stopping old containers..."
    docker-compose -f "$COMPOSE_FILE" down --timeout 30

    # Start new containers
    log_info "Starting new containers..."
    if docker-compose -f "$COMPOSE_FILE" up -d; then
        log_success "Containers started successfully"
    else
        log_error "Failed to start containers"
        exit 1
    fi

    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 10
}

###############################################################################
# Health Check
###############################################################################

verify_deployment() {
    log_info "Verifying deployment..."

    # Run health check script
    if [ -f "$SCRIPT_DIR/health-check.sh" ]; then
        if bash "$SCRIPT_DIR/health-check.sh"; then
            log_success "Health check passed"
        else
            log_error "Health check failed"
            log_error "Run './scripts/rollback.sh' to rollback"
            exit 1
        fi
    else
        log_warning "Health check script not found, skipping..."
    fi
}

###############################################################################
# Cleanup
###############################################################################

cleanup_old_images() {
    log_info "Cleaning up old Docker images..."

    # Remove dangling images
    docker image prune -f || true

    # Keep only last 3 versions
    # docker images --format "{{.Repository}}:{{.Tag}} {{.ID}}" | grep chat- | tail -n +4 | awk '{print $2}' | xargs -r docker rmi || true

    log_success "Cleanup completed"
}

###############################################################################
# Main Deployment Flow
###############################################################################

main() {
    # Create logs directory
    mkdir -p "$PROJECT_ROOT/logs"

    log_info "========================================="
    log_info "Starting Production Deployment"
    log_info "Timestamp: $TIMESTAMP"
    log_info "========================================="

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-build)
                SKIP_BUILD=true
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
    backup_deployment
    build_images
    deploy_application
    verify_deployment
    cleanup_old_images

    log_success "========================================="
    log_success "Deployment Completed Successfully!"
    log_success "========================================="
    log_info "Log file: $LOG_FILE"
    log_info ""
    log_info "Next steps:"
    log_info "  1. Check application logs: docker-compose -f $COMPOSE_FILE logs -f"
    log_info "  2. Monitor health: curl http://localhost/health"
    log_info "  3. Review docs/OPERATIONAL_CHECKLIST.md"
}

# Run main function
main "$@"

#!/bin/bash

###############################################################################
# Rollback Script
###############################################################################
# Quickly rollback to a previous deployment in case of issues
#
# Usage:
#   ./scripts/rollback.sh [BACKUP_TIMESTAMP]
#
# Arguments:
#   BACKUP_TIMESTAMP  Optional timestamp of backup to restore (e.g., 20240115_143022)
#                     If not provided, will rollback to the most recent backup
#
# Prerequisites:
#   - Previous deployment backup exists in backups/ directory
#   - Docker and Docker Compose installed
#
# Related Docs:
#   - docs/RECOVERY_PLAYBOOK.md
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
BACKUP_DIR="$PROJECT_ROOT/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$PROJECT_ROOT/logs/rollback_${TIMESTAMP}.log"

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

###############################################################################
# Rollback Functions
###############################################################################

list_available_backups() {
    log_info "Available backups:"

    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
        log_error "No backups found in $BACKUP_DIR"
        return 1
    fi

    # List environment file backups
    local backups=$(ls -t "$BACKUP_DIR"/.env.production.* 2>/dev/null || echo "")

    if [ -z "$backups" ]; then
        log_error "No environment file backups found"
        return 1
    fi

    echo "$backups" | while read -r backup; do
        local timestamp=$(basename "$backup" | sed 's/.env.production.//')
        local date=$(echo "$timestamp" | cut -d'_' -f1)
        local time=$(echo "$timestamp" | cut -d'_' -f2)
        echo "  - $timestamp (Date: ${date:0:4}-${date:4:2}-${date:6:2} Time: ${time:0:2}:${time:2:2}:${time:4:2})"
    done

    return 0
}

select_backup() {
    local target_timestamp=$1

    if [ -n "$target_timestamp" ]; then
        # Use specified timestamp
        BACKUP_TIMESTAMP="$target_timestamp"
    else
        # Use most recent backup
        local latest_backup=$(ls -t "$BACKUP_DIR"/.env.production.* 2>/dev/null | head -n1 || echo "")

        if [ -z "$latest_backup" ]; then
            log_error "No backups available"
            exit 1
        fi

        BACKUP_TIMESTAMP=$(basename "$latest_backup" | sed 's/.env.production.//')
        log_info "Using most recent backup: $BACKUP_TIMESTAMP"
    fi

    # Verify backup exists
    if [ ! -f "$BACKUP_DIR/.env.production.$BACKUP_TIMESTAMP" ]; then
        log_error "Backup not found: .env.production.$BACKUP_TIMESTAMP"
        log_info "Available backups:"
        list_available_backups
        exit 1
    fi
}

confirm_rollback() {
    log_warning "========================================="
    log_warning "ROLLBACK CONFIRMATION"
    log_warning "========================================="
    log_warning "This will rollback to backup: $BACKUP_TIMESTAMP"
    log_warning ""
    log_warning "Current deployment will be stopped and replaced"
    log_warning ""

    read -p "Are you sure you want to proceed? (yes/no): " -r
    echo

    if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
        log_info "Rollback cancelled"
        exit 0
    fi
}

backup_current_state() {
    log_info "Backing up current state before rollback..."

    mkdir -p "$BACKUP_DIR"

    # Backup current environment file
    if [ -f "$PROJECT_ROOT/.env.production" ]; then
        cp "$PROJECT_ROOT/.env.production" "$BACKUP_DIR/.env.production.pre-rollback_${TIMESTAMP}"
        log_success "Current state backed up"
    fi
}

restore_environment() {
    log_info "Restoring environment configuration..."

    # Restore environment file
    if [ -f "$BACKUP_DIR/.env.production.$BACKUP_TIMESTAMP" ]; then
        cp "$BACKUP_DIR/.env.production.$BACKUP_TIMESTAMP" "$PROJECT_ROOT/.env.production"
        log_success "Environment file restored"
    else
        log_error "Environment backup not found"
        exit 1
    fi
}

restart_services() {
    log_info "Restarting services with previous configuration..."

    cd "$PROJECT_ROOT"

    # Stop current containers
    log_info "Stopping current containers..."
    docker-compose -f "$COMPOSE_FILE" down --timeout 30

    # Pull previous images (if available)
    log_info "Pulling previous images..."
    docker-compose -f "$COMPOSE_FILE" pull || true

    # Start containers
    log_info "Starting containers with previous configuration..."
    if docker-compose -f "$COMPOSE_FILE" up -d; then
        log_success "Services restarted successfully"
    else
        log_error "Failed to restart services"
        exit 1
    fi

    # Wait for services to start
    log_info "Waiting for services to initialize..."
    sleep 15
}

verify_rollback() {
    log_info "Verifying rollback..."

    # Run health check
    if [ -f "$SCRIPT_DIR/health-check.sh" ]; then
        if bash "$SCRIPT_DIR/health-check.sh" --timeout 120; then
            log_success "Health check passed after rollback"
        else
            log_error "Health check failed after rollback"
            log_error "Manual intervention required"
            exit 1
        fi
    else
        log_warning "Health check script not found, skipping verification"
    fi
}

###############################################################################
# Main Rollback Flow
###############################################################################

main() {
    # Create logs directory
    mkdir -p "$PROJECT_ROOT/logs"

    log_info "========================================="
    log_info "Starting Rollback Process"
    log_info "Timestamp: $TIMESTAMP"
    log_info "========================================="

    # Check prerequisites
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi

    # Show available backups
    list_available_backups || exit 1

    # Select backup to restore
    select_backup "${1:-}"

    # Confirm rollback
    confirm_rollback

    # Execute rollback steps
    backup_current_state
    restore_environment
    restart_services
    verify_rollback

    log_success "========================================="
    log_success "Rollback Completed Successfully!"
    log_success "========================================="
    log_info "Rolled back to: $BACKUP_TIMESTAMP"
    log_info "Log file: $LOG_FILE"
    log_info ""
    log_info "Next steps:"
    log_info "  1. Verify application functionality"
    log_info "  2. Check logs: docker-compose -f $COMPOSE_FILE logs -f"
    log_info "  3. Create incident report (docs/RECOVERY_PLAYBOOK.md)"
    log_info "  4. Investigate root cause of deployment failure"
}

# Run main function
main "$@"

#!/bin/bash

###############################################################################
# Health Check Script
###############################################################################
# Verifies that the application is running correctly after deployment
#
# Usage:
#   ./scripts/health-check.sh [OPTIONS]
#
# Options:
#   --endpoint URL  Health check endpoint (default: http://localhost/health)
#   --timeout SEC   Timeout in seconds (default: 300)
#   --interval SEC  Check interval in seconds (default: 5)
#   --help          Show this help message
#
# Exit Codes:
#   0 - Health check passed
#   1 - Health check failed
#   2 - Timeout reached
###############################################################################

set -uo pipefail  # Exit on undefined variables and pipe failures

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
HEALTH_ENDPOINT="${HEALTH_ENDPOINT:-http://localhost/health}"
TIMEOUT=300  # 5 minutes
INTERVAL=5   # 5 seconds
REQUIRED_CHECKS=3  # Number of successful checks required

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
Health Check Script

Usage: ./scripts/health-check.sh [OPTIONS]

Options:
  --endpoint URL  Health check endpoint (default: http://localhost/health)
  --timeout SEC   Timeout in seconds (default: 300)
  --interval SEC  Check interval in seconds (default: 5)
  --help          Show this help message

Examples:
  ./scripts/health-check.sh
  ./scripts/health-check.sh --endpoint http://api.example.com/health
  ./scripts/health-check.sh --timeout 60 --interval 10

Exit Codes:
  0 - Health check passed
  1 - Health check failed
  2 - Timeout reached

EOF
}

###############################################################################
# Health Check Functions
###############################################################################

check_endpoint() {
    local endpoint=$1
    local response
    local http_code

    # Make HTTP request and capture response and status code
    response=$(curl -s -w "\n%{http_code}" --connect-timeout 10 --max-time 30 "$endpoint" 2>&1)
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    # Check HTTP status code
    if [ "$http_code" != "200" ]; then
        return 1
    fi

    # Check response body contains expected fields
    if echo "$body" | grep -q '"ok"'; then
        return 0
    else
        return 1
    fi
}

check_docker_containers() {
    log_info "Checking Docker containers status..."

    # Check if containers are running
    local api_status=$(docker ps --filter "name=api" --format "{{.Status}}" | grep -c "Up" || echo "0")
    local caddy_status=$(docker ps --filter "name=caddy" --format "{{.Status}}" | grep -c "Up" || echo "0")

    if [ "$api_status" -eq 0 ]; then
        log_error "API container is not running"
        return 1
    fi

    if [ "$caddy_status" -eq 0 ]; then
        log_error "Caddy container is not running"
        return 1
    fi

    log_success "All containers are running"
    return 0
}

check_docker_health() {
    log_info "Checking Docker containers health status..."

    # Check health status of containers
    local unhealthy=$(docker ps --filter "health=unhealthy" --format "{{.Names}}" || echo "")

    if [ -n "$unhealthy" ]; then
        log_error "Unhealthy containers detected: $unhealthy"
        return 1
    fi

    log_success "All containers are healthy"
    return 0
}

check_logs_for_errors() {
    log_info "Checking recent logs for errors..."

    # Check API logs for critical errors (last 50 lines)
    local errors=$(docker-compose -f docker-compose.production.yml logs --tail=50 api 2>&1 | grep -i -E "error|exception|fatal" | grep -v "DeprecationWarning" || echo "")

    if [ -n "$errors" ]; then
        log_warning "Errors found in logs:"
        echo "$errors" | head -n 5
        # Don't fail on log errors, just warn
        return 0
    fi

    log_success "No critical errors in recent logs"
    return 0
}

###############################################################################
# Main Health Check Flow
###############################################################################

main() {
    log_info "========================================="
    log_info "Starting Health Check"
    log_info "Endpoint: $HEALTH_ENDPOINT"
    log_info "Timeout: ${TIMEOUT}s"
    log_info "========================================="

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --endpoint)
                HEALTH_ENDPOINT="$2"
                shift 2
                ;;
            --timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            --interval)
                INTERVAL="$2"
                shift 2
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

    # Step 1: Check Docker containers
    if ! check_docker_containers; then
        log_error "Docker container check failed"
        exit 1
    fi

    # Step 2: Wait for containers to be healthy
    log_info "Waiting for containers to be healthy..."
    sleep 10

    # Step 3: Poll health endpoint
    local elapsed=0
    local consecutive_successes=0

    while [ $elapsed -lt $TIMEOUT ]; do
        log_info "Checking health endpoint... (attempt $(( elapsed / INTERVAL + 1 )))"

        if check_endpoint "$HEALTH_ENDPOINT"; then
            consecutive_successes=$((consecutive_successes + 1))
            log_success "Health check passed ($consecutive_successes/$REQUIRED_CHECKS)"

            if [ $consecutive_successes -ge $REQUIRED_CHECKS ]; then
                break
            fi
        else
            consecutive_successes=0
            log_warning "Health check failed, retrying in ${INTERVAL}s..."
        fi

        sleep $INTERVAL
        elapsed=$((elapsed + INTERVAL))
    done

    # Check if we reached required successful checks
    if [ $consecutive_successes -lt $REQUIRED_CHECKS ]; then
        log_error "Health check timeout reached after ${TIMEOUT}s"
        log_error "Only $consecutive_successes/$REQUIRED_CHECKS successful checks"
        exit 2
    fi

    # Step 4: Check Docker health status
    if ! check_docker_health; then
        log_error "Docker health check failed"
        exit 1
    fi

    # Step 5: Check logs for errors
    check_logs_for_errors

    log_success "========================================="
    log_success "All Health Checks Passed!"
    log_success "========================================="
    log_info ""
    log_info "Application is healthy and ready to serve traffic"
    log_info "Health endpoint: $HEALTH_ENDPOINT"

    exit 0
}

# Run main function
main "$@"

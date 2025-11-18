#!/bin/bash

###############################################################################
# AWS Environment Setup Script
###############################################################################
# Sets up AWS environment and fetches secrets from AWS Secrets Manager
#
# Usage:
#   ./scripts/setup-aws-env.sh [OPTIONS]
#
# Options:
#   --secret-name NAME    AWS Secrets Manager secret name
#   --region REGION       AWS region (default: us-east-1)
#   --output-file FILE    Output file path (default: .env.production)
#   --dry-run             Show what would be done without making changes
#   --help                Show this help message
#
# Prerequisites:
#   - AWS CLI installed and configured
#   - IAM permissions to access Secrets Manager
#   - .env.production.example file as template
#
# Related Docs:
#   - docs/deployment/AWS_DEPLOYMENT_GUIDE.md
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
SECRET_NAME="${AWS_SECRET_NAME:-chat-app/jwt-secrets}"
AWS_REGION="${AWS_REGION:-us-east-1}"
OUTPUT_FILE="$PROJECT_ROOT/.env.production"
TEMPLATE_FILE="$PROJECT_ROOT/.env.production.example"
DRY_RUN=false

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
AWS Environment Setup Script

Usage: ./scripts/setup-aws-env.sh [OPTIONS]

Options:
  --secret-name NAME    AWS Secrets Manager secret name (default: chat-app/jwt-secrets)
  --region REGION       AWS region (default: us-east-1)
  --output-file FILE    Output file path (default: .env.production)
  --dry-run             Show what would be done without making changes
  --help                Show this help message

Examples:
  # Basic setup
  ./scripts/setup-aws-env.sh

  # Specify custom secret name and region
  ./scripts/setup-aws-env.sh --secret-name my-app/secrets --region ap-northeast-2

  # Dry run to preview changes
  ./scripts/setup-aws-env.sh --dry-run

EOF
}

###############################################################################
# Prerequisite Checks
###############################################################################

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        log_error "Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured"
        log_error "Run: aws configure"
        exit 1
    fi

    # Check template file exists
    if [ ! -f "$TEMPLATE_FILE" ]; then
        log_error "Template file not found: $TEMPLATE_FILE"
        exit 1
    fi

    log_success "All prerequisites met"
}

###############################################################################
# AWS Secrets Manager Functions
###############################################################################

fetch_jwt_secrets() {
    log_info "Fetching JWT secrets from AWS Secrets Manager..."
    log_info "Secret: $SECRET_NAME"
    log_info "Region: $AWS_REGION"

    # Fetch secret from AWS Secrets Manager
    local secret_string
    secret_string=$(aws secretsmanager get-secret-value \
        --secret-id "$SECRET_NAME" \
        --region "$AWS_REGION" \
        --query SecretString \
        --output text 2>&1)

    if [ $? -ne 0 ]; then
        log_error "Failed to fetch secrets from AWS Secrets Manager"
        log_error "$secret_string"
        log_error ""
        log_error "Troubleshooting:"
        log_error "  1. Verify secret exists: aws secretsmanager list-secrets --region $AWS_REGION"
        log_error "  2. Check IAM permissions: secretsmanager:GetSecretValue"
        log_error "  3. Verify secret name: $SECRET_NAME"
        exit 1
    fi

    # Parse JSON secrets
    JWT_SECRET_CURRENT=$(echo "$secret_string" | jq -r '.current // empty')
    JWT_SECRET_PREVIOUS=$(echo "$secret_string" | jq -r '.previous // empty')

    if [ -z "$JWT_SECRET_CURRENT" ]; then
        log_error "JWT_SECRET_CURRENT not found in secret"
        log_error "Expected JSON format: {\"current\": \"...\", \"previous\": \"...\"}"
        exit 1
    fi

    log_success "JWT secrets fetched successfully"
}

###############################################################################
# Environment File Generation
###############################################################################

create_env_file() {
    log_info "Creating environment file..."

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would create: $OUTPUT_FILE"
        return
    fi

    # Backup existing file if it exists
    if [ -f "$OUTPUT_FILE" ]; then
        local backup_file="${OUTPUT_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$OUTPUT_FILE" "$backup_file"
        log_info "Existing file backed up to: $backup_file"
    fi

    # Copy template
    cp "$TEMPLATE_FILE" "$OUTPUT_FILE"

    # Replace JWT secrets
    if [ -n "${JWT_SECRET_CURRENT:-}" ]; then
        sed -i "s|JWT_SECRET_CURRENT=.*|JWT_SECRET_CURRENT=$JWT_SECRET_CURRENT|" "$OUTPUT_FILE"
    fi

    if [ -n "${JWT_SECRET_PREVIOUS:-}" ]; then
        sed -i "s|JWT_SECRET_PREVIOUS=.*|JWT_SECRET_PREVIOUS=$JWT_SECRET_PREVIOUS|" "$OUTPUT_FILE"
    fi

    # Enable AWS Secrets Manager
    sed -i "s|USE_AWS_SECRETS=.*|USE_AWS_SECRETS=true|" "$OUTPUT_FILE"
    sed -i "s|AWS_REGION=.*|AWS_REGION=$AWS_REGION|" "$OUTPUT_FILE"
    sed -i "s|AWS_SECRET_NAME=.*|AWS_SECRET_NAME=$SECRET_NAME|" "$OUTPUT_FILE"

    log_success "Environment file created: $OUTPUT_FILE"
}

validate_env_file() {
    log_info "Validating environment file..."

    if [ ! -f "$OUTPUT_FILE" ]; then
        log_error "Environment file not found: $OUTPUT_FILE"
        return 1
    fi

    # Check required variables
    local required_vars=(
        "NODE_ENV"
        "PORT"
        "MONGO_URI"
        "REDIS_URL"
        "JWT_SECRET_CURRENT"
        "CORS_ORIGIN"
        "S3_BUCKET_NAME"
    )

    local missing_vars=()

    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" "$OUTPUT_FILE"; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_warning "Missing required variables:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        log_warning "Please update $OUTPUT_FILE manually"
        return 1
    fi

    log_success "Environment file validation passed"
    return 0
}

###############################################################################
# Summary and Next Steps
###############################################################################

show_summary() {
    log_success "========================================="
    log_success "AWS Environment Setup Complete!"
    log_success "========================================="
    log_info ""
    log_info "Environment file: $OUTPUT_FILE"
    log_info "AWS Region: $AWS_REGION"
    log_info "Secret Name: $SECRET_NAME"
    log_info ""
    log_warning "IMPORTANT: Review and update the following in $OUTPUT_FILE:"
    log_warning "  - MONGO_URI (your MongoDB Atlas connection string)"
    log_warning "  - REDIS_URL (your ElastiCache endpoint)"
    log_warning "  - CORS_ORIGIN (your production domain)"
    log_warning "  - S3_BUCKET_NAME, S3_ACCESS_KEY, S3_SECRET_KEY"
    log_info ""
    log_info "Next steps:"
    log_info "  1. Review $OUTPUT_FILE"
    log_info "  2. Update database connection strings"
    log_info "  3. Update CORS_ORIGIN with your domain"
    log_info "  4. Run deployment: ./scripts/deploy.sh"
    log_info ""
    log_info "Security note:"
    log_info "  - Never commit .env.production to git"
    log_info "  - Restrict file permissions: chmod 600 $OUTPUT_FILE"
}

###############################################################################
# Main Setup Flow
###############################################################################

main() {
    log_info "========================================="
    log_info "AWS Environment Setup"
    log_info "========================================="

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --secret-name)
                SECRET_NAME="$2"
                shift 2
                ;;
            --region)
                AWS_REGION="$2"
                shift 2
                ;;
            --output-file)
                OUTPUT_FILE="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
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

    # Execute setup steps
    check_prerequisites
    fetch_jwt_secrets
    create_env_file

    if [ "$DRY_RUN" = false ]; then
        validate_env_file || log_warning "Please review and fix the environment file"
        show_summary

        # Set secure permissions
        chmod 600 "$OUTPUT_FILE"
        log_success "File permissions set to 600 (owner read/write only)"
    else
        log_info "[DRY RUN] No changes made"
    fi
}

# Run main function
main "$@"

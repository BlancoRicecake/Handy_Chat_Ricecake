import { Injectable, Logger } from '@nestjs/common';

/**
 * Feature Flags Service for gradual rollout
 *
 * Manages feature toggles for progressive deployment:
 * - Phase 1: Legacy JWT mode (7-day tokens)
 * - Phase 2: JWT rotation enabled
 * - Phase 3: Refresh tokens enabled (15min + 7day)
 * - Phase 4: Single-session enforcement
 */
@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor() {
    this.logger.log('Feature flags initialized:');
    this.logger.log(`  USE_ROTATED_JWT: ${this.useRotatedJwt()}`);
    this.logger.log(`  ENABLE_REFRESH_TOKEN: ${this.enableRefreshToken()}`);
    this.logger.log(`  ENFORCE_SINGLE_SESSION: ${this.enforceSingleSession()}`);
  }

  /**
   * Phase 2+: Use rotated JWT secrets (CURRENT/PREVIOUS)
   * When false: Use legacy JWT_SECRET only
   */
  useRotatedJwt(): boolean {
    return process.env.USE_ROTATED_JWT === 'true';
  }

  /**
   * Phase 3+: Enable refresh token mechanism
   * When false: Use 7-day access tokens only (legacy)
   * When true: Use 15-min access + 7-day refresh tokens
   */
  enableRefreshToken(): boolean {
    return process.env.ENABLE_REFRESH_TOKEN === 'true';
  }

  /**
   * Phase 4+: Enforce single-session policy
   * When false: Allow multiple refresh tokens per user
   * When true: Invalidate previous tokens on new login
   */
  enforceSingleSession(): boolean {
    return process.env.ENFORCE_SINGLE_SESSION === 'true';
  }

  /**
   * Get access token expiry based on feature flags
   */
  getAccessTokenExpiry(): string {
    if (this.enableRefreshToken()) {
      return process.env.ACCESS_TOKEN_EXPIRY || '15m';
    }
    return '7d'; // Legacy mode
  }

  /**
   * Get refresh token expiry
   */
  getRefreshTokenExpiry(): string {
    return process.env.REFRESH_TOKEN_EXPIRY || '7d';
  }

  /**
   * Get JWT clock tolerance (seconds)
   * Allows for minor time drift between servers
   */
  getClockTolerance(): number {
    return parseInt(process.env.JWT_CLOCK_TOLERANCE || '60', 10);
  }
}

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { SecretsService } from '../config/secrets.service';
import { FeatureFlagsService } from '../config/feature-flags.service';
import { JwtPayload, RefreshTokenPayload } from './jwt-payload.interface';

/**
 * JWT Service with secret rotation support
 *
 * Features:
 * - Generate access and refresh tokens
 * - Validate tokens with rotation (current + previous secret)
 * - Feature flag support for gradual rollout
 * - Clock tolerance for time drift
 */
@Injectable()
export class JwtService {
  private readonly logger = new Logger(JwtService.name);

  constructor(
    private secretsService: SecretsService,
    private featureFlags: FeatureFlagsService,
  ) {}

  /**
   * Generate an access token
   */
  async generateAccessToken(userId: string, username: string): Promise<string> {
    const secrets = await this.secretsService.getJwtSecrets();
    const expiresIn = this.featureFlags.getAccessTokenExpiry();

    const payload: JwtPayload = {
      sub: userId,
      username,
    };

    return jwt.sign(payload, secrets.current, {
      expiresIn,
    });
  }

  /**
   * Generate a refresh token
   * Only used when ENABLE_REFRESH_TOKEN=true
   */
  async generateRefreshToken(userId: string): Promise<{ token: string; jti: string; expiresAt: Date }> {
    if (!this.featureFlags.enableRefreshToken()) {
      throw new Error('Refresh tokens are not enabled');
    }

    const secrets = await this.secretsService.getJwtSecrets();
    const expiresIn = this.featureFlags.getRefreshTokenExpiry();
    const jti = uuidv4();

    const payload: RefreshTokenPayload = {
      sub: userId,
      jti,
      type: 'refresh',
    };

    const token = jwt.sign(payload, secrets.current, {
      expiresIn,
    });

    // Calculate expiration timestamp
    const decodedToken = jwt.decode(token) as any;
    const expiresAt = new Date(decodedToken.exp * 1000);

    return { token, jti, expiresAt };
  }

  /**
   * Verify an access token with rotation support
   * Tries current secret first, then falls back to previous secret if available
   */
  async verifyAccessToken(token: string): Promise<JwtPayload> {
    const secrets = await this.secretsService.getJwtSecrets();
    const clockTolerance = this.featureFlags.getClockTolerance();

    // Try current secret first
    try {
      const payload = jwt.verify(token, secrets.current, {
        clockTolerance,
      }) as JwtPayload;

      return payload;
    } catch (currentError) {
      // If rotation is enabled and previous secret exists, try it
      if (this.featureFlags.useRotatedJwt() && secrets.previous) {
        try {
          const payload = jwt.verify(token, secrets.previous, {
            clockTolerance,
          }) as JwtPayload;

          this.logger.debug(`Token validated with previous secret for user ${payload.sub}`);
          return payload;
        } catch (previousError) {
          this.logger.warn(
            `Token validation failed with both current and previous secrets: ${currentError instanceof Error ? currentError.message : 'Unknown error'}`,
          );
          throw new UnauthorizedException('Invalid token');
        }
      }

      // No rotation or no previous secret
      this.logger.warn(`Token validation failed: ${currentError instanceof Error ? currentError.message : 'Unknown error'}`);
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Verify a refresh token with rotation support
   */
  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    if (!this.featureFlags.enableRefreshToken()) {
      throw new Error('Refresh tokens are not enabled');
    }

    const secrets = await this.secretsService.getJwtSecrets();
    const clockTolerance = this.featureFlags.getClockTolerance();

    // Try current secret first
    try {
      const payload = jwt.verify(token, secrets.current, {
        clockTolerance,
      }) as RefreshTokenPayload;

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      return payload;
    } catch (currentError) {
      // Try previous secret if available
      if (this.featureFlags.useRotatedJwt() && secrets.previous) {
        try {
          const payload = jwt.verify(token, secrets.previous, {
            clockTolerance,
          }) as RefreshTokenPayload;

          if (payload.type !== 'refresh') {
            throw new UnauthorizedException('Invalid token type');
          }

          this.logger.debug(`Refresh token validated with previous secret for user ${payload.sub}`);
          return payload;
        } catch (previousError) {
          this.logger.warn(
            `Refresh token validation failed with both secrets: ${currentError instanceof Error ? currentError.message : 'Unknown error'}`,
          );
          throw new UnauthorizedException('Invalid refresh token');
        }
      }

      this.logger.warn(`Refresh token validation failed: ${currentError instanceof Error ? currentError.message : 'Unknown error'}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Decode a token without verification (for debugging)
   * DO NOT use for authentication
   */
  decodeToken(token: string): JwtPayload | RefreshTokenPayload | null {
    return jwt.decode(token) as JwtPayload | RefreshTokenPayload | null;
  }

  /**
   * Get token expiration info
   */
  getTokenExpiry(token: string): Date | null {
    const decoded = jwt.decode(token) as any;
    if (!decoded || !decoded.exp) {
      return null;
    }
    return new Date(decoded.exp * 1000);
  }
}

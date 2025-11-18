import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { RefreshToken } from './refresh-token.schema';
import { FeatureFlagsService } from '../config/feature-flags.service';

/**
 * Service for managing refresh tokens
 *
 * Features:
 * - Store and validate refresh tokens
 * - Revoke tokens on logout/password change
 * - Single-session enforcement (optional)
 * - Automatic cleanup via TTL index
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshToken>,
    private featureFlags: FeatureFlagsService,
  ) {}

  /**
   * Store a new refresh token
   */
  async storeRefreshToken(
    userId: string,
    jti: string,
    token: string,
    expiresAt: Date,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<void> {
    // Hash the token before storing
    const tokenHash = await bcrypt.hash(token, 10);

    // If single-session mode, revoke all existing tokens
    if (this.featureFlags.enforceSingleSession()) {
      await this.revokeAllUserTokens(userId);
      this.logger.debug(`Revoked all existing tokens for user ${userId} (single-session mode)`);
    }

    // Store the new token
    await this.refreshTokenModel.create({
      userId: new Types.ObjectId(userId),
      tokenHash,
      jti,
      issuedAt: new Date(),
      expiresAt,
      deviceInfo,
      ipAddress,
    });

    this.logger.debug(`Stored refresh token for user ${userId} (jti: ${jti})`);
  }

  /**
   * Validate a refresh token
   * Returns the user ID if valid, throws UnauthorizedException if invalid
   */
  async validateRefreshToken(jti: string, token: string): Promise<string> {
    const storedToken = await this.refreshTokenModel.findOne({ jti });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    if (storedToken.isRevoked) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Verify the token hash
    const isValid = await bcrypt.compare(token, storedToken.tokenHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return storedToken.userId.toString();
  }

  /**
   * Revoke a specific refresh token (logout)
   */
  async revokeToken(jti: string): Promise<void> {
    const result = await this.refreshTokenModel.updateOne(
      { jti },
      { isRevoked: true },
    );

    if (result.matchedCount === 0) {
      this.logger.warn(`Attempted to revoke non-existent token: ${jti}`);
    } else {
      this.logger.debug(`Revoked refresh token: ${jti}`);
    }
  }

  /**
   * Revoke all refresh tokens for a user (password change, security event)
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    const result = await this.refreshTokenModel.updateMany(
      { userId: new Types.ObjectId(userId), isRevoked: false },
      { isRevoked: true },
    );

    this.logger.log(`Revoked ${result.modifiedCount} tokens for user ${userId}`);
  }

  /**
   * Clean up expired and revoked tokens (manual - TTL index handles this automatically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenModel.deleteMany({
      $or: [
        { expiresAt: { $lt: new Date() } },
        { isRevoked: true, updatedAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }, // Revoked >7 days ago
      ],
    });

    this.logger.log(`Cleaned up ${result.deletedCount} expired/revoked tokens`);
    return result.deletedCount;
  }

  /**
   * Get active token count for a user (for monitoring)
   */
  async getActiveTokenCount(userId: string): Promise<number> {
    return this.refreshTokenModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    });
  }
}

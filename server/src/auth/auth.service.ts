import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from './jwt.service';
import { RefreshTokenService } from './refresh-token.service';
import { FeatureFlagsService } from '../config/feature-flags.service';
import { TokensResponse } from './dto/tokens.response';

/**
 * Authentication Service with JWT rotation and refresh token support
 *
 * Features:
 * - User registration and login
 * - Access + Refresh token generation
 * - Token refresh mechanism
 * - Logout (token revocation)
 * - Feature flag support for gradual rollout
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  /**
   * Register a new user
   * Returns access token (and refresh token if enabled)
   */
  async register(
    username: string,
    password: string,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<TokensResponse> {
    // Check if user already exists
    const existingUser = await this.usersService.findByUsername(username);
    if (existingUser) {
      throw new ConflictException('Username already exists');
    }

    // Create user
    const user = await this.usersService.createUser(username, password);
    const userId = (user as any)._id.toString();

    this.logger.log(`User registered: ${username} (${userId})`);

    // Generate tokens
    return this.generateTokens(userId, username, deviceInfo, ipAddress);
  }

  /**
   * Login existing user
   * Returns access token (and refresh token if enabled)
   */
  async login(
    username: string,
    password: string,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<TokensResponse> {
    // Find user
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Validate password
    const isValid = await this.usersService.validatePassword(user, password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const userId = (user as any)._id.toString();
    this.logger.log(`User logged in: ${username} (${userId})`);

    // Generate tokens
    return this.generateTokens(userId, username, deviceInfo, ipAddress);
  }

  /**
   * Refresh access token using refresh token
   * Only available when ENABLE_REFRESH_TOKEN=true
   */
  async refresh(
    refreshToken: string,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<TokensResponse> {
    if (!this.featureFlags.enableRefreshToken()) {
      throw new UnauthorizedException('Refresh tokens are not enabled');
    }

    // Verify refresh token JWT signature
    const payload = await this.jwtService.verifyRefreshToken(refreshToken);

    // Validate refresh token in database
    await this.refreshTokenService.validateRefreshToken(
      payload.jti,
      refreshToken,
    );

    // Get user info
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    this.logger.debug(
      `Token refreshed for user: ${user.username} (${payload.sub})`,
    );

    // Generate new tokens
    return this.generateTokens(
      payload.sub,
      user.username,
      deviceInfo,
      ipAddress,
    );
  }

  /**
   * Logout user by revoking refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    if (!this.featureFlags.enableRefreshToken()) {
      this.logger.debug('Logout called but refresh tokens are disabled');
      return;
    }

    try {
      const payload = await this.jwtService.verifyRefreshToken(refreshToken);
      await this.refreshTokenService.revokeToken(payload.jti);
      this.logger.log(`User logged out: ${payload.sub}`);
    } catch (error) {
      this.logger.warn(
        `Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Don't throw - logout should be idempotent
    }
  }

  /**
   * Validate access token (legacy method for backward compatibility)
   * Used by WebSocket gateway
   *
   * Supports handy-platform tokens with 'id' field
   */
  async validateToken(
    token: string,
  ): Promise<{ userId: string; username?: string }> {
    const payload = await this.jwtService.verifyAccessToken(token);
    return {
      userId: payload.id,
      username: payload.username, // Optional: may not be present in handy-platform tokens
    };
  }

  /**
   * Generate access token and optionally refresh token
   */
  private async generateTokens(
    userId: string,
    username: string,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<TokensResponse> {
    // Generate access token
    const accessToken = await this.jwtService.generateAccessToken(
      userId,
      username,
    );

    // Calculate expiry
    const expiryStr = this.featureFlags.getAccessTokenExpiry();
    const expiresIn = this.parseExpiryToSeconds(expiryStr);

    // If refresh tokens are enabled, generate one
    let refreshToken: string | undefined;

    if (this.featureFlags.enableRefreshToken()) {
      const refreshData = await this.jwtService.generateRefreshToken(userId);
      refreshToken = refreshData.token;

      // Store refresh token in database
      await this.refreshTokenService.storeRefreshToken(
        userId,
        refreshData.jti,
        refreshToken,
        refreshData.expiresAt,
        deviceInfo,
        ipAddress,
      );

      this.logger.debug(`Generated refresh token for user ${userId}`);
    }

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  /**
   * Parse expiry string (e.g., "15m", "7d") to seconds
   */
  private parseExpiryToSeconds(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1), 10);

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        return 900; // 15 minutes default
    }
  }
}

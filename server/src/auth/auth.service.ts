import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from './jwt.service';

/**
 * Authentication Service
 *
 * 메인서버에서 JWT 발급, 채팅서버는 검증만 수행
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Validate access token
   * Used by WebSocket gateway
   */
  async validateToken(
    token: string,
  ): Promise<{ userId: string; username?: string }> {
    const payload = await this.jwtService.verifyAccessToken(token);
    return {
      userId: payload.id,
      username: payload.username,
    };
  }
}

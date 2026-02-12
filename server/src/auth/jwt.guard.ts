import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from './jwt.service';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './jwt-payload.interface';

/**
 * JWT Guard for protecting HTTP endpoints
 *
 * Usage: @UseGuards(JwtGuard)
 *
 * - Validates Bearer tokens from Authorization header
 * - Auto-registers user in chat server DB on first access
 * - Attaches user info to request object
 */
@Injectable()
export class JwtGuard implements CanActivate {
  private readonly logger = new Logger(JwtGuard.name);

  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload: JwtPayload =
        await this.jwtService.verifyAccessToken(token);

      // 메인서버 userId로 유저 캐시 레코드 찾기/생성
      // username이 없으면 mainServerId를 사용 (unknown 중복 방지)
      const user = await this.usersService.findOrCreateByMainServerId(
        payload.id,
        payload.username || payload.id,
        payload.avatar,
      );

      // request.user에 mainServerId를 id로 설정 (기존 코드 호환)
      request.user = {
        id: user.mainServerId,
        username: user.username,
      };

      return true;
    } catch (error) {
      this.logger.warn(
        `JWT validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Extract Bearer token from Authorization header
   */
  private extractTokenFromHeader(request: any): string | null {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }
}

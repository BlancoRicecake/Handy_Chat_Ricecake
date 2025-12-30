import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtGuard } from './jwt.guard';

interface AuthenticatedRequest {
  user: {
    id: string;
    username: string;
  };
}

/**
 * Authentication Controller
 *
 * 인증은 메인서버에서 처리
 * 채팅서버는 JWT 검증만 수행
 */
@Controller('auth')
export class AuthController {
  /**
   * JWT 토큰 검증 및 유저 정보 반환
   * 테스트/디버깅용
   */
  @Get('me')
  @UseGuards(JwtGuard)
  async me(@Req() req: AuthenticatedRequest) {
    return {
      id: req.user.id,
      username: req.user.username,
    };
  }
}

import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtService } from './jwt.service';
import { JwtGuard } from './jwt.guard';
import { UsersModule } from '../users/users.module';

/**
 * Authentication Module
 *
 * 메인서버에서 JWT 발급, 채팅서버는 검증만 수행
 *
 * Provides:
 * - JwtService (token validation with rotation)
 * - JwtGuard (HTTP endpoint protection + auto user registration)
 * - AuthService (token validation for WebSocket)
 */
@Module({
  imports: [UsersModule],
  providers: [AuthService, JwtService, JwtGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtService, JwtGuard],
})
export class AuthModule {}

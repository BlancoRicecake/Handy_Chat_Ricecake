import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtService } from './jwt.service';
import { JwtGuard } from './jwt.guard';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshToken, RefreshTokenSchema } from './refresh-token.schema';
import { UsersModule } from '../users/users.module';

/**
 * Authentication Module
 *
 * Provides:
 * - AuthService (registration, login, refresh, logout)
 * - JwtService (token generation/validation with rotation)
 * - RefreshTokenService (token storage/revocation)
 * - JwtGuard (HTTP endpoint protection)
 * - AuthController (REST endpoints)
 */
@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  providers: [AuthService, JwtService, JwtGuard, RefreshTokenService],
  controllers: [AuthController],
  exports: [AuthService, JwtService, JwtGuard],
})
export class AuthModule {}

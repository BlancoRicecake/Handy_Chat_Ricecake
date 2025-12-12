import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Ip,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { IsString, MinLength } from 'class-validator';

class RegisterDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new user
   * Returns: { accessToken, refreshToken?, expiresIn }
   */
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Ip() ip: string,
  ) {
    const deviceInfo = this.extractDeviceInfo(req);
    return this.authService.register(
      dto.username,
      dto.password,
      deviceInfo,
      ip,
    );
  }

  /**
   * Login existing user
   * Returns: { accessToken, refreshToken?, expiresIn }
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Ip() ip: string) {
    const deviceInfo = this.extractDeviceInfo(req);
    return this.authService.login(dto.username, dto.password, deviceInfo, ip);
  }

  /**
   * Refresh access token using refresh token
   * Returns: { accessToken, refreshToken?, expiresIn }
   *
   * Only available when ENABLE_REFRESH_TOKEN=true
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Ip() ip: string,
  ) {
    const deviceInfo = this.extractDeviceInfo(req);
    return this.authService.refresh(dto.refreshToken, deviceInfo, ip);
  }

  /**
   * Logout user by revoking refresh token
   * Returns: empty response (204 No Content)
   *
   * Only available when ENABLE_REFRESH_TOKEN=true
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
  }

  /**
   * Extract device information from request headers
   */
  private extractDeviceInfo(req: Request): string {
    const userAgent = req.headers['user-agent'] || 'unknown';
    return userAgent.substring(0, 255); // Limit length
  }
}

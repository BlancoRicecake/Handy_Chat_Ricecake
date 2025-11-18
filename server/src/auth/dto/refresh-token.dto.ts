import { IsString, IsNotEmpty } from 'class-validator';

/**
 * DTO for refresh token endpoint
 */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

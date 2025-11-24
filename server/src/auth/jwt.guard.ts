import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from './jwt.service';
import { JwtPayload } from './jwt-payload.interface';

/**
 * JWT Guard for protecting HTTP endpoints
 *
 * Usage: @UseGuards(JwtGuard)
 *
 * Validates Bearer tokens from Authorization header
 * Attaches user payload to request object
 */
@Injectable()
export class JwtGuard implements CanActivate {
  private readonly logger = new Logger(JwtGuard.name);

  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    // DEBUG: Use console.log to bypass Winston
    console.log(`[DEBUG] Token extracted: ${token ? token.substring(0, 30) + '...' : 'null'}`);

    if (!token) {
      console.error('[DEBUG] No token provided in Authorization header');
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload: JwtPayload = await this.jwtService.verifyAccessToken(token);

      // DEBUG: Log successful verification and payload
      console.log(`[DEBUG] Token verified successfully`);
      console.log(`[DEBUG] Payload: ${JSON.stringify(payload)}`);
      console.log(`[DEBUG] User ID (id): ${payload.id}`);
      console.log(`[DEBUG] Username: ${payload.username || 'N/A'}`);

      // Attach user payload to request
      request.user = payload;

      return true;
    } catch (error) {
      // DEBUG: Log detailed error information
      console.error(`[DEBUG] JWT validation FAILED`);
      console.error(`[DEBUG] Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
      console.error(`[DEBUG] Error message: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(`[DEBUG] Full error:`, error);

      this.logger.warn(`JWT validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

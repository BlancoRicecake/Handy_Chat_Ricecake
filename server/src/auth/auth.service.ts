import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  private getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (
      !secret ||
      secret === 'CHANGE_THIS_TO_A_STRONG_RANDOM_SECRET_MINIMUM_32_CHARS'
    ) {
      throw new Error(
        'JWT_SECRET must be configured with a strong random value',
      );
    }
    return secret;
  }

  async register(username: string, password: string) {
    // Check if user already exists
    const existingUser = await this.usersService.findByUsername(username);
    if (existingUser) {
      throw new ConflictException('Username already exists');
    }

    // Create user
    const user = await this.usersService.createUser(username, password);

    // Generate JWT
    const token = this.generateToken((user as any)._id.toString(), username);

    return {
      token,
      userId: (user as any)._id.toString(),
      username: user.username,
    };
  }

  async login(username: string, password: string) {
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

    // Generate JWT
    const token = this.generateToken(
      (user as any)._id.toString(),
      user.username,
    );

    return {
      token,
      userId: (user as any)._id.toString(),
      username: user.username,
    };
  }

  validateToken(token: string): { userId: string; username: string } {
    try {
      const payload = jwt.verify(token, this.getJwtSecret()) as any;
      return {
        userId: payload.sub,
        username: payload.username,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private generateToken(userId: string, username: string): string {
    const payload = {
      sub: userId,
      username,
    };

    return jwt.sign(payload, this.getJwtSecret(), {
      expiresIn: '7d',
    });
  }
}

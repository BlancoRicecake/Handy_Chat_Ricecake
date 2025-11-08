import { Body, Controller, Post } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Controller('auth')
export class DevAuthController {
  @Post('dev-token')
  devToken(@Body() body: { userId: string }) {
    const secret = process.env.JWT_SECRET;
    if (
      !secret ||
      secret === 'CHANGE_THIS_TO_A_STRONG_RANDOM_SECRET_MINIMUM_32_CHARS'
    ) {
      throw new Error(
        'JWT_SECRET must be configured with a strong random value',
      );
    }
    const token = jwt.sign({ sub: body.userId }, secret, { expiresIn: '7d' });
    return { token };
  }
}

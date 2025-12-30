import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { RoomsService } from './rooms.service';
import { ReadReceiptService } from './read-receipt.service';
import { JwtGuard } from '../auth/jwt.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    username?: string;
  };
}

@Controller('rooms')
@UseGuards(JwtGuard)
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly readReceiptService: ReadReceiptService,
  ) {}

  @Get()
  async list(
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    const userId = req!.user.id;
    const limit = Math.min(
      Math.max(parseInt(limitStr || '20', 10) || 20, 1),
      50,
    );
    const offset = Math.max(parseInt(offsetStr || '0', 10) || 0, 0);

    const { rooms, total } = await this.rooms.getRoomListForUser(userId, {
      limit,
      offset,
    });

    return {
      rooms,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + rooms.length < total,
        nextCursor: null,
      },
    };
  }

  // { userA: 'u1', userB: 'u2' } -> 항상 같은 1:1 방 반환
  @Post('ensure')
  async ensure(@Body() body: { userA: string; userB: string }) {
    const room = await this.rooms.getOrCreateOneToOne(body.userA, body.userB);
    return room;
  }

  @Post(':roomId/read')
  async markAsRead(
    @Param('roomId') roomId: string,
    @Body() body: { messageId?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;
    await this.readReceiptService.markAsRead(roomId, userId, body.messageId);
    return { success: true };
  }
}

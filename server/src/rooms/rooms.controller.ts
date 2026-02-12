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
import { UsersService } from '../users/users.service';
import { JwtGuard } from '../auth/jwt.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    username?: string;
    avatar?: string;
  };
}

@Controller('rooms')
@UseGuards(JwtGuard)
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly readReceiptService: ReadReceiptService,
    private readonly usersService: UsersService,
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

  // { partnerId: 'u2', partnerUsername?: 'seller1' } -> 현재 유저와 파트너의 1:1 방 반환
  @Post('ensure')
  async ensure(
    @Body()
    body: {
      partnerId: string;
      partnerUsername?: string;
      partnerAvatar?: string;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;

    // partner 캐시 레코드 생성 (없으면 partnerId를 username으로 사용)
    await this.usersService.findOrCreateByMainServerId(
      body.partnerId,
      body.partnerUsername || body.partnerId,
      body.partnerAvatar,
    );

    const room = await this.rooms.getOrCreateOneToOne(userId, body.partnerId);
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

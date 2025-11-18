import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtGuard } from '../auth/jwt.guard';

@Controller('messages')
@UseGuards(JwtGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  // /messages?roomId=xxx&limit=30&before=2025-01-01T00:00:00.000Z
  @Get()
  async list(
    @Query('roomId') roomId: string,
    @Query('limit') limit = '30',
    @Query('before') before?: string,
  ) {
    const l = Number(limit) || 30;
    const rows = await this.messages.listByRoom(roomId, l, before);
    return rows;
  }
}

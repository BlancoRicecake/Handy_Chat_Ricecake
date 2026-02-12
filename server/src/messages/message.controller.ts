import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { MessagesService } from './messages.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CreateMessageDto } from './dto/create-message.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id?: string;
    userId?: string;
    username?: string;
    avatar?: string;
  };
}

@Controller('messages')
@UseGuards(JwtGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const senderId = req.user.id || req.user.userId;

    if (!senderId) {
      throw new Error('Unable to determine sender ID from token');
    }

    return this.messages.create({
      roomId: dto.roomId,
      senderId,
      clientMessageId: dto.clientMessageId,
      text: dto.text,
      fileUrl: dto.fileUrl,
      messageType: dto.messageType,
      metadata: dto.metadata ?? null,
      status: 'delivered',
    });
  }

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

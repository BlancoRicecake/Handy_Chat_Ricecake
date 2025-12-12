import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Server } from 'socket.io';
import { Message, MessageDocument } from './message.schema';
import { CreateMessagePayload, MessageType } from './message.types';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private socketServer: Server | null = null;

  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  setSocketServer(server: Server) {
    this.socketServer = server;
  }

  private determineMessageType(payload: CreateMessagePayload): MessageType {
    if (payload.messageType) return payload.messageType;
    if (payload.fileUrl) return 'image';
    return 'text';
  }

  async create(payload: CreateMessagePayload) {
    try {
      const doc = new this.messageModel({
        roomId: payload.roomId,
        senderId: payload.senderId,
        clientMessageId: payload.clientMessageId,
        messageType: this.determineMessageType(payload),
        text: payload.text,
        fileUrl: payload.fileUrl,
        metadata: payload.metadata ?? null,
        status: payload.status ?? 'sent',
      });
      await doc.save();
      const message = doc.toJSON();

      // WebSocket 브로드캐스트
      if (this.socketServer) {
        this.socketServer.to(payload.roomId).emit('message', message);
      }

      return message;
    } catch (e) {
      // duplicate clientMessageId -> idempotency
      if ((e as any)?.code === 11000) {
        this.logger.warn('Duplicate clientMessageId ignored');
        return this.messageModel
          .findOne({ clientMessageId: payload.clientMessageId })
          .lean();
      }
      throw e;
    }
  }

  async listByRoom(roomId: string, limit = 30, before?: string) {
    const query: any = { roomId };
    if (before) query.createdAt = { $lt: new Date(before) };
    return this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}

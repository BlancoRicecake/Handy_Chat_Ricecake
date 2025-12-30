import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Server } from 'socket.io';
import { Message, MessageDocument } from './message.schema';
import { CreateMessagePayload, MessageType } from './message.types';
import { RoomsService } from '../rooms/rooms.service';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private socketServer: Server | null = null;

  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @Inject(forwardRef(() => RoomsService))
    private readonly roomsService: RoomsService,
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

      // Update room's last message info
      await this.roomsService.updateLastMessage(
        payload.roomId,
        doc._id.toString(),
        (message as any).createdAt,
      );

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

  async getLastMessagesBatch(roomIds: string[]): Promise<Map<string, any>> {
    if (roomIds.length === 0) return new Map();

    const messages = await this.messageModel.aggregate([
      { $match: { roomId: { $in: roomIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$roomId',
          lastMessage: { $first: '$$ROOT' },
        },
      },
    ]);

    return new Map(messages.map((m) => [m._id, m.lastMessage]));
  }

  async getUnreadCountsBatch(
    roomIds: string[],
    userId: string,
    readReceipts: Map<string, Date>,
  ): Promise<Map<string, number>> {
    if (roomIds.length === 0) return new Map();

    // Build conditions for each room based on lastReadAt
    const orConditions = roomIds.map((roomId) => {
      const lastReadAt = readReceipts.get(roomId) ?? new Date(0);
      return {
        roomId,
        senderId: { $ne: userId },
        createdAt: { $gt: lastReadAt },
      };
    });

    const counts = await this.messageModel.aggregate([
      { $match: { $or: orConditions } },
      {
        $group: {
          _id: '$roomId',
          count: { $sum: 1 },
        },
      },
    ]);

    return new Map(counts.map((c) => [c._id, c.count]));
  }
}

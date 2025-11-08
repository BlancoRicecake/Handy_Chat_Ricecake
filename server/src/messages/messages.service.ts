import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument } from './message.schema';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  async create(payload: Partial<Message>) {
    try {
      const doc = new this.messageModel(payload);
      await doc.save();
      return doc.toJSON();
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

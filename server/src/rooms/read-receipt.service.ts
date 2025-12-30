import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReadReceipt, ReadReceiptDocument } from './read-receipt.schema';

@Injectable()
export class ReadReceiptService {
  constructor(
    @InjectModel(ReadReceipt.name)
    private readReceiptModel: Model<ReadReceiptDocument>,
  ) {}

  async markAsRead(
    roomId: string,
    userId: string,
    messageId?: string,
  ): Promise<void> {
    await this.readReceiptModel.updateOne(
      { roomId, userId },
      {
        lastReadAt: new Date(),
        ...(messageId && { lastReadMessageId: messageId }),
      },
      { upsert: true },
    );
  }

  async getLastReadAt(roomId: string, userId: string): Promise<Date | null> {
    const receipt = await this.readReceiptModel
      .findOne({ roomId, userId })
      .lean();
    return receipt?.lastReadAt ?? null;
  }

  async getLastReadAtBatch(
    userId: string,
    roomIds: string[],
  ): Promise<Map<string, Date>> {
    const receipts = await this.readReceiptModel
      .find({ userId, roomId: { $in: roomIds } })
      .lean();

    return new Map(receipts.map((r) => [r.roomId, r.lastReadAt]));
  }
}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReadReceiptDocument = HydratedDocument<ReadReceipt>;

@Schema({ timestamps: { createdAt: true, updatedAt: true } })
export class ReadReceipt {
  @Prop({ required: true, index: true })
  roomId!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true })
  lastReadAt!: Date;

  @Prop({ required: false })
  lastReadMessageId?: string;
}

export const ReadReceiptSchema = SchemaFactory.createForClass(ReadReceipt);

// Compound unique index: one receipt per user per room
ReadReceiptSchema.index({ roomId: 1, userId: 1 }, { unique: true });

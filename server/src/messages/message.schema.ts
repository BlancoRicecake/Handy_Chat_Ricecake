import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Message {
  @Prop({ required: true, index: true })
  roomId!: string;

  @Prop({ required: true, index: true })
  senderId!: string;

  @Prop({ required: true, unique: true, index: true })
  clientMessageId!: string;

  @Prop({ enum: ['text', 'image'], default: 'text' })
  type!: 'text' | 'image';

  @Prop()
  text?: string;

  @Prop()
  fileUrl?: string;

  @Prop({ enum: ['sent', 'delivered'], default: 'sent' })
  status!: 'sent' | 'delivered';
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ roomId: 1, createdAt: -1 });

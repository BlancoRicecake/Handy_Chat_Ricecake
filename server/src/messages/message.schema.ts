import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { MESSAGE_TYPES, MessageType } from './message.types';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Message {
  @Prop({ required: true, index: true })
  roomId!: string;

  @Prop({ required: true, index: true })
  senderId!: string;

  @Prop({ required: true, unique: true, index: true })
  clientMessageId!: string;

  @Prop({ enum: MESSAGE_TYPES, default: 'text' })
  messageType!: MessageType;

  @Prop()
  text?: string;

  @Prop()
  fileUrl?: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  metadata?: Record<string, any> | null;

  @Prop({ enum: ['sent', 'delivered'], default: 'sent' })
  status!: 'sent' | 'delivered';
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ roomId: 1, createdAt: -1 });

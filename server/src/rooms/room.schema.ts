import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RoomDocument = HydratedDocument<Room>;

@Schema({ timestamps: { createdAt: true, updatedAt: true } })
export class Room {
  @Prop({ type: [String], required: true, index: true })
  userIds!: string[];

  @Prop()
  lastMessage?: string;
}

export const RoomSchema = SchemaFactory.createForClass(Room);

// Ensure uniqueness for 1:1 rooms (sorted userIds key)
RoomSchema.index({ userIds: 1 }, { unique: true });

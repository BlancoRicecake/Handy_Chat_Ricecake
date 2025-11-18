import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true, index: true })
  username!: string;

  @Prop({ required: true })
  passwordHash!: string;

  /**
   * Current refresh token hash for single-session enforcement
   * Only used when ENFORCE_SINGLE_SESSION=true
   * Optional for backward compatibility
   */
  @Prop({ required: false })
  currentRefreshTokenHash?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

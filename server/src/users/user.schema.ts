import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User extends Document {
  /**
   * 메인서버의 userId (JWT.id)
   * 채팅서버에서 유저를 식별하는 기본 키
   */
  @Prop({ required: true, unique: true, index: true })
  mainServerId!: string;

  /**
   * 표시용 username (캐시)
   * 메인서버에서 변경 시 JWT를 통해 자동 업데이트
   */
  @Prop({ required: true })
  username!: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

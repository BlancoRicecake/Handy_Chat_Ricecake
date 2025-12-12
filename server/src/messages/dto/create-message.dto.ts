import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsObject,
  MaxLength,
} from 'class-validator';
import { MESSAGE_TYPES, MessageType } from '../message.types';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  clientMessageId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  fileUrl?: string;

  @IsOptional()
  @IsIn(MESSAGE_TYPES)
  messageType?: MessageType;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Room, RoomSchema } from './room.schema';
import { ReadReceipt, ReadReceiptSchema } from './read-receipt.schema';
import { RoomsService } from './rooms.service';
import { ReadReceiptService } from './read-receipt.service';
import { RoomsController } from './rooms.controller';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: ReadReceipt.name, schema: ReadReceiptSchema },
    ]),
    UsersModule,
    AuthModule,
    forwardRef(() => MessagesModule),
  ],
  controllers: [RoomsController],
  providers: [RoomsService, ReadReceiptService],
  exports: [RoomsService, ReadReceiptService],
})
export class RoomsModule {}

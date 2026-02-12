import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Room, RoomDocument } from './room.schema';
import { ReadReceiptService } from './read-receipt.service';
import { UsersService } from '../users/users.service';
import { MessagesService } from '../messages/messages.service';

export interface RoomListItem {
  roomId: string;
  partner: {
    id: string;
    username: string;
    avatar?: string;
  };
  lastMessage?: {
    id: string;
    text?: string;
    messageType: string;
    senderId: string;
    createdAt: Date;
  };
  unreadCount: number;
  lastMessageAt?: Date;
  createdAt: Date;
}

export interface RoomListResult {
  rooms: RoomListItem[];
  total: number;
}

@Injectable()
export class RoomsService {
  constructor(
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    private readonly readReceiptService: ReadReceiptService,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
  ) {}

  async getOrCreateOneToOne(userA: string, userB: string) {
    const pair = [userA, userB].sort();
    const found = await this.roomModel.findOne({ userIds: pair }).lean();
    if (found) return found;
    const doc = new this.roomModel({ userIds: pair });
    await doc.save();
    return doc.toJSON();
  }

  async updateLastMessage(
    roomId: string,
    messageId: string,
    timestamp: Date,
  ): Promise<void> {
    await this.roomModel.updateOne(
      { _id: roomId },
      {
        lastMessageId: messageId,
        lastMessageAt: timestamp,
      },
    );
  }

  async getRoomListForUser(
    userId: string,
    options: { limit: number; offset: number },
  ): Promise<RoomListResult> {
    // Step 1: Get rooms where user is a participant, sorted by lastMessageAt
    const rooms = await this.roomModel
      .find({ userIds: userId })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .skip(options.offset)
      .limit(options.limit)
      .lean();

    if (rooms.length === 0) {
      return { rooms: [], total: 0 };
    }

    const roomIds = rooms.map((r) => r._id.toString());

    // Step 2: Get partner user IDs
    const partnerIds = rooms.map((r) => r.userIds.find((id) => id !== userId)!);

    // Step 3: Batch fetch partner details (mainServerId로 조회)
    const partnerMap = await this.usersService.findByMainServerIds(partnerIds);

    // Step 4: Batch fetch last messages
    const lastMessages =
      await this.messagesService.getLastMessagesBatch(roomIds);

    // Step 5: Batch fetch read receipts
    const readReceipts = await this.readReceiptService.getLastReadAtBatch(
      userId,
      roomIds,
    );

    // Step 6: Batch count unread messages
    const unreadCounts = await this.messagesService.getUnreadCountsBatch(
      roomIds,
      userId,
      readReceipts,
    );

    // Step 7: Get total count
    const total = await this.roomModel.countDocuments({ userIds: userId });

    // Step 8: Combine results
    const roomList: RoomListItem[] = rooms.map((room) => {
      const roomId = room._id.toString();
      const partnerId = room.userIds.find((id) => id !== userId)!;
      const partner = partnerMap.get(partnerId);
      const lastMessage = lastMessages.get(roomId);

      return {
        roomId,
        partner: partner
          ? { id: partner.mainServerId, username: partner.username, avatar: partner.avatar }
          : { id: partnerId, username: 'Unknown User' },
        lastMessage: lastMessage
          ? {
              id: lastMessage._id.toString(),
              text: lastMessage.text,
              messageType: lastMessage.messageType,
              senderId: lastMessage.senderId,
              createdAt: lastMessage.createdAt,
            }
          : undefined,
        unreadCount: unreadCounts.get(roomId) ?? 0,
        lastMessageAt: room.lastMessageAt ?? (room as any).createdAt,
        createdAt: (room as any).createdAt,
      };
    });

    return { rooms: roomList, total };
  }
}

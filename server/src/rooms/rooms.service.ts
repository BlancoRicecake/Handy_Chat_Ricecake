import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Room, RoomDocument } from './room.schema';

@Injectable()
export class RoomsService {
  constructor(@InjectModel(Room.name) private roomModel: Model<RoomDocument>) {}

  async getOrCreateOneToOne(userA: string, userB: string) {
    const pair = [userA, userB].sort();
    const found = await this.roomModel.findOne({ userIds: pair }).lean();
    if (found) return found;
    const doc = new this.roomModel({ userIds: pair });
    await doc.save();
    return doc.toJSON();
  }
}

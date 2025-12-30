import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async createUser(username: string, password: string): Promise<User> {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = new this.userModel({
      username,
      passwordHash,
    });

    return user.save();
  }

  async findByUsername(username: string): Promise<any> {
    return this.userModel.findOne({ username }).lean();
  }

  async findById(userId: string): Promise<any> {
    return this.userModel.findById(userId).lean();
  }

  async findByIds(
    userIds: string[],
  ): Promise<Map<string, { _id: string; username: string }>> {
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('_id username')
      .lean();

    return new Map(
      users.map((u) => [
        u._id.toString(),
        { _id: u._id.toString(), username: u.username },
      ]),
    );
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }
}

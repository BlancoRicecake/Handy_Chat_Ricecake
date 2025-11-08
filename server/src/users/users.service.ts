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

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }
}

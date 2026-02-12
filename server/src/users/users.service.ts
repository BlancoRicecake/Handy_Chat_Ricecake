import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  /**
   * 메인서버 userId로 유저 찾기 또는 생성 (캐시용)
   * JWT 검증 후 호출되어 유저 레코드를 자동 생성/업데이트
   */
  async findOrCreateByMainServerId(
    mainServerId: string,
    username: string,
    avatar?: string,
  ): Promise<User> {
    let user = await this.userModel.findOne({ mainServerId });

    if (!user) {
      // 첫 접근 시 캐시 레코드 생성
      user = await this.userModel.create({
        mainServerId,
        username,
        avatar,
      });
    } else {
      let dirty = false;
      if (user.username !== username) {
        user.username = username;
        dirty = true;
      }
      if (avatar !== undefined && user.avatar !== avatar) {
        user.avatar = avatar;
        dirty = true;
      }
      if (dirty) {
        await user.save();
      }
    }

    return user;
  }

  /**
   * mainServerId로 유저 찾기
   */
  async findByMainServerId(mainServerId: string): Promise<User | null> {
    return this.userModel.findOne({ mainServerId });
  }

  /**
   * 여러 mainServerId로 유저들 조회 (배치)
   * Room 목록에서 파트너 username 조회용
   */
  async findByMainServerIds(
    mainServerIds: string[],
  ): Promise<Map<string, { mainServerId: string; username: string; avatar?: string }>> {
    const users = await this.userModel
      .find({ mainServerId: { $in: mainServerIds } })
      .select('mainServerId username avatar')
      .lean();

    return new Map(
      users.map((u) => [
        u.mainServerId,
        { mainServerId: u.mainServerId, username: u.username, avatar: u.avatar },
      ]),
    );
  }
}

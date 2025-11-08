import { Body, Controller, Post } from '@nestjs/common';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  // { userA: 'u1', userB: 'u2' } -> 항상 같은 1:1 방 반환
  @Post('ensure')
  async ensure(@Body() body: { userA: string; userB: string }) {
    const room = await this.rooms.getOrCreateOneToOne(body.userA, body.userB);
    return room;
  }
}

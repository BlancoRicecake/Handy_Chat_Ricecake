import { RoomsService } from './rooms.service';
export declare class RoomsController {
    private readonly rooms;
    constructor(rooms: RoomsService);
    ensure(body: {
        userA: string;
        userB: string;
    }): Promise<import("mongoose").FlattenMaps<import("mongoose").Document<unknown, {}, import("./room.schema").Room, {}, {}> & import("./room.schema").Room & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    } & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>>;
}
//# sourceMappingURL=rooms.controller.d.ts.map
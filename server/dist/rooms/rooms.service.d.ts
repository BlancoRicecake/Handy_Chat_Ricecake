import { Model } from 'mongoose';
import { Room, RoomDocument } from './room.schema';
export declare class RoomsService {
    private roomModel;
    constructor(roomModel: Model<RoomDocument>);
    getOrCreateOneToOne(userA: string, userB: string): Promise<import("mongoose").FlattenMaps<import("mongoose").Document<unknown, {}, Room, {}, {}> & Room & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    } & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>>;
}
//# sourceMappingURL=rooms.service.d.ts.map
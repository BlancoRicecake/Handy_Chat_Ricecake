import { Model } from 'mongoose';
import { Message, MessageDocument } from './message.schema';
export declare class MessagesService {
    private messageModel;
    private readonly logger;
    constructor(messageModel: Model<MessageDocument>);
    create(payload: Partial<Message>): Promise<import("mongoose").FlattenMaps<import("mongoose").Document<unknown, {}, Message, {}, {}> & Message & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    } & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }> | null>;
    listByRoom(roomId: string, limit?: number, before?: string): Promise<(import("mongoose").FlattenMaps<import("mongoose").Document<unknown, {}, Message, {}, {}> & Message & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }>)[]>;
}
//# sourceMappingURL=messages.service.d.ts.map
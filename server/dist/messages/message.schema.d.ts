import { HydratedDocument } from 'mongoose';
export type MessageDocument = HydratedDocument<Message>;
export declare class Message {
    roomId: string;
    senderId: string;
    clientMessageId: string;
    type: 'text' | 'image';
    text?: string;
    fileUrl?: string;
    status: 'sent' | 'delivered';
}
export declare const MessageSchema: import("mongoose").Schema<Message, import("mongoose").Model<Message, any, any, any, import("mongoose").Document<unknown, any, Message, any, {}> & Message & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Message, import("mongoose").Document<unknown, {}, import("mongoose").FlatRecord<Message>, {}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & import("mongoose").FlatRecord<Message> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
//# sourceMappingURL=message.schema.d.ts.map
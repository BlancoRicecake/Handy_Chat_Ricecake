import { MessagesService } from './messages.service';
export declare class MessagesController {
    private readonly messages;
    constructor(messages: MessagesService);
    list(roomId: string, limit?: string, before?: string): Promise<(import("mongoose").FlattenMaps<import("mongoose").Document<unknown, {}, import("./message.schema").Message, {}, {}> & import("./message.schema").Message & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }>)[]>;
}
//# sourceMappingURL=message.controller.d.ts.map
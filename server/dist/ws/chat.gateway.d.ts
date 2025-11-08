import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { MessagesService } from '../messages/messages.service';
export declare class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly messages;
    private online;
    constructor(messages: MessagesService);
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): Promise<void>;
    onJoin(client: Socket, { roomId }: {
        roomId: string;
    }): Promise<void>;
    onTyping(client: Socket, { roomId }: {
        roomId: string;
    }): void;
    onMessage(client: Socket, payload: {
        roomId: string;
        text?: string;
        fileUrl?: string;
        clientMessageId: string;
        type?: string;
        fileName?: string;
        fileType?: string;
    }): Promise<void>;
}
//# sourceMappingURL=chat.gateway.d.ts.map
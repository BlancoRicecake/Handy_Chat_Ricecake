import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WsException,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { Throttle } from '@nestjs/throttler';
import { MessagesService } from '../messages/messages.service';
import { AuthService } from '../auth/auth.service';
import { MessageType } from '../messages/message.types';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:3000', 'http://localhost:8080'],
  },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server!: Server;
  private online = new Map<string, string>(); // socketId -> userId
  private messageRateLimiter = new Map<
    string,
    { count: number; resetTime: number }
  >(); // userId -> rate limit data
  private readonly MESSAGE_LIMIT = 10; // messages per second
  private readonly MESSAGE_WINDOW = 1000; // 1 second in ms

  constructor(
    private readonly messages: MessagesService,
    private readonly authService: AuthService,
  ) {}

  afterInit(server: Server) {
    this.messages.setSocketServer(server);
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth && (client.handshake.auth as any).token) ||
        (client.handshake.headers['authorization'] as string)?.replace(
          'Bearer ',
          '',
        ) ||
        '';

      // Use AuthService for token validation (supports rotation and handy-platform tokens)
      const payload = await this.authService.validateToken(token);
      if (!payload?.userId) throw new Error('No userId in token');

      // Note: username is optional (handy-platform tokens may use userId as username)
      this.online.set(client.id, payload.userId);
    } catch (e) {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = this.online.get(client.id);
    this.online.delete(client.id);
    // Clean up rate limiter data
    if (userId) {
      this.messageRateLimiter.delete(userId);
    }
  }

  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const userLimit = this.messageRateLimiter.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      // New window or expired window - reset
      this.messageRateLimiter.set(userId, {
        count: 1,
        resetTime: now + this.MESSAGE_WINDOW,
      });
      return true;
    }

    if (userLimit.count < this.MESSAGE_LIMIT) {
      // Within limit - increment
      userLimit.count++;
      return true;
    }

    // Rate limit exceeded
    return false;
  }

  @Throttle({ default: { limit: 5, ttl: 1000 } }) // 5 joins per second
  @SubscribeMessage('join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() { roomId }: { roomId: string },
  ) {
    await client.join(roomId);
    const userId = this.online.get(client.id);
    client.to(roomId).emit('presence', { userId, state: 'join' });
  }

  @Throttle({ default: { limit: 5, ttl: 1000 } }) // 5 typing events per second
  @SubscribeMessage('typing')
  onTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() { roomId }: { roomId: string },
  ) {
    const userId = this.online.get(client.id);
    client.to(roomId).emit('typing', { userId });
  }

  @SubscribeMessage('message')
  async onMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      roomId: string;
      text?: string;
      fileUrl?: string;
      clientMessageId: string;
      messageType?: MessageType;
      metadata?: Record<string, any>;
      // Legacy fields for backward compatibility
      type?: string;
      fileName?: string;
      fileType?: string;
    },
  ) {
    const senderId = this.online.get(client.id) as string;

    // Check rate limit
    if (!this.checkRateLimit(senderId)) {
      client.emit('error', {
        message: 'Rate limit exceeded. Maximum 10 messages per second.',
        clientMessageId: payload.clientMessageId,
      });
      return;
    }

    // Validate message payload size (max 10KB for text)
    if (payload.text && payload.text.length > 10000) {
      throw new WsException('Message text too long (max 10000 characters)');
    }

    // Validate fileUrl length
    if (payload.fileUrl && payload.fileUrl.length > 2048) {
      throw new WsException('File URL too long');
    }

    // Validate required fields
    if (!payload.roomId || !payload.clientMessageId) {
      throw new WsException('Missing required fields: roomId, clientMessageId');
    }

    // Validate metadata size (max 10KB)
    if (payload.metadata) {
      const metadataSize = JSON.stringify(payload.metadata).length;
      if (metadataSize > 10240) {
        throw new WsException('Metadata too large (max 10KB)');
      }
    }

    // Service handles DB save + broadcast
    await this.messages.create({
      roomId: payload.roomId,
      senderId,
      clientMessageId: payload.clientMessageId,
      messageType: payload.messageType,
      text: payload.text,
      fileUrl: payload.fileUrl,
      metadata: payload.metadata ?? null,
      status: 'delivered',
    });

    // ACK to sender (broadcast is handled by service)
    client.emit('ack', { clientMessageId: payload.clientMessageId });
  }
}

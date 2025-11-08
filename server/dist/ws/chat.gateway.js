"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const jwt = require("jsonwebtoken");
const throttler_1 = require("@nestjs/throttler");
const messages_service_1 = require("../messages/messages.service");
let ChatGateway = class ChatGateway {
    constructor(messages) {
        this.messages = messages;
        this.online = new Map();
    }
    async handleConnection(client) {
        try {
            const token = (client.handshake.auth && client.handshake.auth.token) ||
                client.handshake.headers['authorization']?.replace('Bearer ', '') ||
                '';
            const secret = process.env.JWT_SECRET;
            if (!secret ||
                secret === 'CHANGE_THIS_TO_A_STRONG_RANDOM_SECRET_MINIMUM_32_CHARS') {
                throw new Error('JWT_SECRET must be configured with a strong random value');
            }
            const payload = jwt.verify(token, secret);
            if (!payload?.sub)
                throw new Error('No sub');
            this.online.set(client.id, payload.sub);
        }
        catch (e) {
            client.disconnect(true);
        }
    }
    async handleDisconnect(client) {
        this.online.delete(client.id);
    }
    async onJoin(client, { roomId }) {
        await client.join(roomId);
        const userId = this.online.get(client.id);
        client.to(roomId).emit('presence', { userId, state: 'join' });
    }
    onTyping(client, { roomId }) {
        const userId = this.online.get(client.id);
        client.to(roomId).emit('typing', { userId });
    }
    async onMessage(client, payload) {
        if (payload.text && payload.text.length > 10000) {
            throw new websockets_1.WsException('Message text too long (max 10000 characters)');
        }
        if (payload.fileUrl && payload.fileUrl.length > 2048) {
            throw new websockets_1.WsException('File URL too long');
        }
        if (!payload.roomId || !payload.clientMessageId) {
            throw new websockets_1.WsException('Missing required fields: roomId, clientMessageId');
        }
        const senderId = this.online.get(client.id);
        const doc = await this.messages.create({
            roomId: payload.roomId,
            senderId,
            clientMessageId: payload.clientMessageId,
            type: payload.fileUrl ? 'image' : 'text',
            text: payload.text,
            fileUrl: payload.fileUrl,
            status: 'delivered',
        });
        client.to(payload.roomId).emit('message', doc);
        client.emit('ack', { clientMessageId: payload.clientMessageId });
    }
};
exports.ChatGateway = ChatGateway;
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 1000 } }),
    (0, websockets_1.SubscribeMessage)('join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "onJoin", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 1000 } }),
    (0, websockets_1.SubscribeMessage)('typing'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "onTyping", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 1000 } }),
    (0, websockets_1.SubscribeMessage)('message'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "onMessage", null);
exports.ChatGateway = ChatGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: process.env.CORS_ORIGIN
                ? process.env.CORS_ORIGIN.split(',')
                : ['http://localhost:3000', 'http://localhost:8080'],
        },
    }),
    __metadata("design:paramtypes", [messages_service_1.MessagesService])
], ChatGateway);
//# sourceMappingURL=chat.gateway.js.map
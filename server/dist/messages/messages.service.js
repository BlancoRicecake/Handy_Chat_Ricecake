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
var MessagesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagesService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const message_schema_1 = require("./message.schema");
let MessagesService = MessagesService_1 = class MessagesService {
    constructor(messageModel) {
        this.messageModel = messageModel;
        this.logger = new common_1.Logger(MessagesService_1.name);
    }
    async create(payload) {
        try {
            const doc = new this.messageModel(payload);
            await doc.save();
            return doc.toJSON();
        }
        catch (e) {
            if (e?.code === 11000) {
                this.logger.warn('Duplicate clientMessageId ignored');
                return this.messageModel
                    .findOne({ clientMessageId: payload.clientMessageId })
                    .lean();
            }
            throw e;
        }
    }
    async listByRoom(roomId, limit = 30, before) {
        const query = { roomId };
        if (before)
            query.createdAt = { $lt: new Date(before) };
        return this.messageModel
            .find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
    }
};
exports.MessagesService = MessagesService;
exports.MessagesService = MessagesService = MessagesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(message_schema_1.Message.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], MessagesService);
//# sourceMappingURL=messages.service.js.map
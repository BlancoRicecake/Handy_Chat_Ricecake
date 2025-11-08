"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const nest_winston_1 = require("nest-winston");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const winston = require("winston");
const health_controller_1 = require("./health/health.controller");
const ws_module_1 = require("./ws/ws.module");
const messages_module_1 = require("./messages/messages.module");
const rooms_module_1 = require("./rooms/rooms.module");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const storage_module_1 = require("./storage/storage.module");
const dev_controller_1 = require("./auth/dev.controller");
const rooms_controller_1 = require("./rooms/rooms.controller");
const message_controller_1 = require("./messages/message.controller");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            throttler_1.ThrottlerModule.forRoot([
                {
                    ttl: 60000,
                    limit: 100,
                },
            ]),
            nest_winston_1.WinstonModule.forRoot({
                transports: [
                    new winston.transports.Console({
                        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
                    }),
                ],
            }),
            mongoose_1.MongooseModule.forRootAsync({
                useFactory: () => ({
                    uri: process.env.MONGO_URI || 'mongodb://localhost:27017/chatdb',
                }),
            }),
            users_module_1.UsersModule,
            auth_module_1.AuthModule,
            storage_module_1.StorageModule,
            rooms_module_1.RoomsModule,
            messages_module_1.MessagesModule,
            ws_module_1.WsModule,
        ],
        controllers: [
            health_controller_1.HealthController,
            dev_controller_1.DevAuthController,
            rooms_controller_1.RoomsController,
            message_controller_1.MessagesController,
        ],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
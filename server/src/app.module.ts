import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { WinstonModule } from 'nest-winston';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import * as winston from 'winston';
import { HealthController } from './health/health.controller';
import { WsModule } from './ws/ws.module';
import { MessagesModule } from './messages/messages.module';
import { RoomsModule } from './rooms/rooms.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StorageModule } from './storage/storage.module';
import { SecretsModule } from './config/secrets.module';
import { FeatureFlagsModule } from './config/feature-flags.module';
import { RoomsController } from './rooms/rooms.controller';
import { MessagesController } from './messages/message.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SecretsModule,
    FeatureFlagsModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 100, // 100 requests per 60 seconds
      },
    ]),
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      ],
    }),
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGO_URI || 'mongodb://localhost:27017/chatdb',
      }),
    }),
    UsersModule,
    AuthModule,
    StorageModule,
    RoomsModule,
    MessagesModule,
    WsModule,
  ],
  controllers: [HealthController, RoomsController, MessagesController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

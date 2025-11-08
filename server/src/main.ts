import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import * as compression from 'compression';

async function bootstrap() {
  // CORS configuration with whitelist
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['https://localhost:8443', 'http://localhost:3000'];

  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
  });

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Security middleware - Helmet with enhanced CSP
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline for styled-components
          imgSrc: ["'self'", 'data:', 'blob:', 'http://localhost:9000'], // Include MinIO for development
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'ws:', 'wss:', 'http://localhost:9000'], // WebSocket + MinIO
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests:
            process.env.NODE_ENV === 'production' ? [] : null,
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      frameguard: {
        action: 'deny',
      },
      noSniff: true,
      xssFilter: true,
    }),
  );

  // Compression middleware
  app.use(compression());

  const port = process.env.PORT || 3000;
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${port}`);
  logger.log(`CORS enabled for: ${corsOrigin.join(', ')}`);
}
bootstrap();

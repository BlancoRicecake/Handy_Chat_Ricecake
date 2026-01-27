import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import * as compression from 'compression';
import { createProxyMiddleware } from 'http-proxy-middleware';

async function bootstrap() {
  // CORS configuration with whitelist
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['https://localhost:8443', 'http://localhost:3000'];

  // Environment validation runs automatically via EnvValidationService (SecretsModule)
  // Application will fail fast if required variables are missing or invalid
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: corsOrigin,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
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

  // Trust proxy configuration for reverse proxy deployments
  if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // Chat API proxy configuration
  // Proxies /chat-api/* requests to the chat server to avoid Mixed Content issues
  const CHAT_SERVER_URL =
    process.env.CHAT_SERVER_URL || 'http://16.176.147.141';

  // CORS handler for chat-api proxy (runs before proxy middleware)
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use('/chat-api', (req: any, res: any, next: any) => {
    const origin = req.headers.origin;
    if (origin && corsOrigin.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization',
      );
    }

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });

  app.use(
    '/chat-api',
    createProxyMiddleware({
      target: CHAT_SERVER_URL,
      changeOrigin: true,
      pathRewrite: { '^/chat-api': '' },
      on: {
        proxyReq: (proxyReq, req) => {
          // Forward Authorization header
          const authHeader = req.headers['authorization'];
          if (authHeader) {
            proxyReq.setHeader('Authorization', authHeader);
          }
        },
        proxyRes: (proxyRes, req) => {
          // Ensure CORS headers are preserved in proxy response
          const origin = req.headers.origin as string;
          if (origin && corsOrigin.includes(origin)) {
            proxyRes.headers['access-control-allow-origin'] = origin;
            proxyRes.headers['access-control-allow-credentials'] = 'true';
          }
        },
        error: (err, req, res) => {
          const logger = new Logger('ChatApiProxy');
          logger.error(`Proxy error: ${err.message}`);
          if (res && 'writeHead' in res) {
            (res as any).writeHead(502, { 'Content-Type': 'application/json' });
            (res as any).end(
              JSON.stringify({ error: 'Chat server unavailable' }),
            );
          }
        },
      },
    }),
  );

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);
  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://${host}:${port}`);
  logger.log(`CORS enabled for: ${corsOrigin.join(', ')}`);
}
bootstrap();

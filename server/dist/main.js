"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const nest_winston_1 = require("nest-winston");
const helmet_1 = require("helmet");
const compression = require("compression");
async function bootstrap() {
    const corsOrigin = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',')
        : ['https://localhost:8443', 'http://localhost:3000'];
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        cors: {
            origin: corsOrigin,
            credentials: true,
        },
    });
    app.useLogger(app.get(nest_winston_1.WINSTON_MODULE_NEST_PROVIDER));
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'blob:', 'http://localhost:9000'],
                fontSrc: ["'self'", 'data:'],
                connectSrc: ["'self'", 'ws:', 'wss:', 'http://localhost:9000'],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
            },
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
        frameguard: {
            action: 'deny',
        },
        noSniff: true,
        xssFilter: true,
    }));
    app.use(compression());
    const port = process.env.PORT || 3000;
    await app.listen(port);
    const logger = new common_1.Logger('Bootstrap');
    logger.log(`API listening on http://localhost:${port}`);
    logger.log(`CORS enabled for: ${corsOrigin.join(', ')}`);
}
bootstrap();
//# sourceMappingURL=main.js.map
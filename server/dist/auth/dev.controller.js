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
exports.DevAuthController = void 0;
const common_1 = require("@nestjs/common");
const jwt = require("jsonwebtoken");
let DevAuthController = class DevAuthController {
    devToken(body) {
        const secret = process.env.JWT_SECRET;
        if (!secret ||
            secret === 'CHANGE_THIS_TO_A_STRONG_RANDOM_SECRET_MINIMUM_32_CHARS') {
            throw new Error('JWT_SECRET must be configured with a strong random value');
        }
        const token = jwt.sign({ sub: body.userId }, secret, { expiresIn: '7d' });
        return { token };
    }
};
exports.DevAuthController = DevAuthController;
__decorate([
    (0, common_1.Post)('dev-token'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DevAuthController.prototype, "devToken", null);
exports.DevAuthController = DevAuthController = __decorate([
    (0, common_1.Controller)('auth')
], DevAuthController);
//# sourceMappingURL=dev.controller.js.map
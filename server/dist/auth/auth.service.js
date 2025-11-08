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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const users_service_1 = require("../users/users.service");
const jwt = require("jsonwebtoken");
let AuthService = class AuthService {
    constructor(usersService) {
        this.usersService = usersService;
    }
    getJwtSecret() {
        const secret = process.env.JWT_SECRET;
        if (!secret ||
            secret === 'CHANGE_THIS_TO_A_STRONG_RANDOM_SECRET_MINIMUM_32_CHARS') {
            throw new Error('JWT_SECRET must be configured with a strong random value');
        }
        return secret;
    }
    async register(username, password) {
        const existingUser = await this.usersService.findByUsername(username);
        if (existingUser) {
            throw new common_1.ConflictException('Username already exists');
        }
        const user = await this.usersService.createUser(username, password);
        const token = this.generateToken(user._id.toString(), username);
        return {
            token,
            userId: user._id.toString(),
            username: user.username,
        };
    }
    async login(username, password) {
        const user = await this.usersService.findByUsername(username);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const isValid = await this.usersService.validatePassword(user, password);
        if (!isValid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const token = this.generateToken(user._id.toString(), user.username);
        return {
            token,
            userId: user._id.toString(),
            username: user.username,
        };
    }
    validateToken(token) {
        try {
            const payload = jwt.verify(token, this.getJwtSecret());
            return {
                userId: payload.sub,
                username: payload.username,
            };
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Invalid token');
        }
    }
    generateToken(userId, username) {
        const payload = {
            sub: userId,
            username,
        };
        return jwt.sign(payload, this.getJwtSecret(), {
            expiresIn: '7d',
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], AuthService);
//# sourceMappingURL=auth.service.js.map
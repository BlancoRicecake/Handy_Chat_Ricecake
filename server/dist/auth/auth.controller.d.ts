import { AuthService } from './auth.service';
declare class RegisterDto {
    username: string;
    password: string;
}
declare class LoginDto {
    username: string;
    password: string;
}
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto): Promise<{
        token: string;
        userId: any;
        username: string;
    }>;
    login(dto: LoginDto): Promise<{
        token: string;
        userId: any;
        username: any;
    }>;
}
export {};
//# sourceMappingURL=auth.controller.d.ts.map
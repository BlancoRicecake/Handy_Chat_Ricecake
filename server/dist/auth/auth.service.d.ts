import { UsersService } from '../users/users.service';
export declare class AuthService {
    private readonly usersService;
    constructor(usersService: UsersService);
    private getJwtSecret;
    register(username: string, password: string): Promise<{
        token: string;
        userId: any;
        username: string;
    }>;
    login(username: string, password: string): Promise<{
        token: string;
        userId: any;
        username: any;
    }>;
    validateToken(token: string): {
        userId: string;
        username: string;
    };
    private generateToken;
}
//# sourceMappingURL=auth.service.d.ts.map
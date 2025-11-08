import { Model } from 'mongoose';
import { User } from './user.schema';
export declare class UsersService {
    private userModel;
    constructor(userModel: Model<User>);
    createUser(username: string, password: string): Promise<User>;
    findByUsername(username: string): Promise<any>;
    findById(userId: string): Promise<any>;
    validatePassword(user: User, password: string): Promise<boolean>;
}
//# sourceMappingURL=users.service.d.ts.map
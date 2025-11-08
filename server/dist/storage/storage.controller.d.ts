import { StorageService } from './storage.service';
declare class PresignedUploadDto {
    fileName: string;
    fileType: string;
}
export declare class StorageController {
    private readonly storageService;
    constructor(storageService: StorageService);
    getPresignedUploadUrl(dto: PresignedUploadDto): Promise<{
        uploadUrl: string;
        fileUrl: string;
        key: string;
    }>;
    getPresignedDownloadUrl(key: string): Promise<{
        downloadUrl: string;
    }>;
}
export {};
//# sourceMappingURL=storage.controller.d.ts.map
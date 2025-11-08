export declare class StorageService {
    private readonly s3Client;
    private readonly publicS3Client;
    private readonly bucket;
    private readonly logger;
    constructor();
    private ensureBucket;
    generatePresignedUploadUrl(fileName: string, fileType: string): Promise<{
        uploadUrl: string;
        fileUrl: string;
        key: string;
    }>;
    generatePresignedDownloadUrl(key: string): Promise<{
        downloadUrl: string;
    }>;
}
//# sourceMappingURL=storage.service.d.ts.map
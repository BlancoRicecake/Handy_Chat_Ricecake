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
var StorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const common_1 = require("@nestjs/common");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
let StorageService = StorageService_1 = class StorageService {
    constructor() {
        this.logger = new common_1.Logger(StorageService_1.name);
        const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
        const region = process.env.S3_REGION || 'us-east-1';
        const accessKeyId = process.env.S3_ACCESS_KEY || 'minioadmin';
        const secretAccessKey = process.env.S3_SECRET_KEY || 'minioadmin';
        const forcePathStyle = process.env.S3_USE_PATH_STYLE === 'true' || endpoint.includes('minio');
        this.bucket = process.env.S3_BUCKET_NAME || 'chat-files';
        this.s3Client = new client_s3_1.S3Client({
            endpoint,
            region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
            forcePathStyle,
        });
        const publicEndpoint = endpoint.replace('minio', 'localhost');
        this.publicS3Client = new client_s3_1.S3Client({
            endpoint: publicEndpoint,
            region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
            forcePathStyle,
        });
        this.logger.log(`S3 Client initialized: endpoint=${endpoint}, publicEndpoint=${publicEndpoint}, bucket=${this.bucket}, forcePathStyle=${forcePathStyle}`);
        this.ensureBucket().catch((err) => this.logger.error('Failed to ensure bucket exists:', err));
    }
    async ensureBucket() {
        try {
            await this.s3Client.send(new client_s3_1.HeadBucketCommand({ Bucket: this.bucket }));
            this.logger.log(`Bucket '${this.bucket}' exists`);
        }
        catch (error) {
            if (error.name === 'NotFound') {
                this.logger.log(`Creating bucket '${this.bucket}'...`);
                await this.s3Client.send(new client_s3_1.CreateBucketCommand({ Bucket: this.bucket }));
                this.logger.log(`Bucket '${this.bucket}' created`);
            }
            else {
                throw error;
            }
        }
    }
    async generatePresignedUploadUrl(fileName, fileType) {
        const timestamp = Date.now();
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const key = `uploads/${timestamp}-${sanitizedFileName}`;
        const command = new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: fileType,
        });
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.publicS3Client, command, {
            expiresIn: 3600,
        });
        const urlObj = new URL(uploadUrl);
        const publicEndpoint = `${urlObj.protocol}//${urlObj.host}`;
        const fileUrl = `${publicEndpoint}/${this.bucket}/${key}`;
        this.logger.log(`Generated presigned upload URL for key: ${key}`);
        return {
            uploadUrl,
            fileUrl,
            key,
        };
    }
    async generatePresignedDownloadUrl(key) {
        const command = new client_s3_1.GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        const downloadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.publicS3Client, command, {
            expiresIn: 3600,
        });
        this.logger.log(`Generated presigned download URL for key: ${key}`);
        return { downloadUrl };
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = StorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], StorageService);
//# sourceMappingURL=storage.service.js.map
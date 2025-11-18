import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly s3Client: S3Client | null;
  private readonly publicS3Client: S3Client | null; // For generating browser-accessible presigned URLs
  private readonly bucket: string;
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Enabled: boolean;

  constructor() {
    // Check if S3 is enabled (MVP mode can disable S3)
    this.s3Enabled = process.env.USE_S3 !== 'false';

    if (!this.s3Enabled) {
      this.logger.warn('S3 storage is DISABLED (USE_S3=false). File upload features will not work.');
      this.s3Client = null;
      this.publicS3Client = null;
      this.bucket = '';
      return;
    }

    const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
    const region = process.env.S3_REGION || 'us-east-1';
    const accessKeyId = process.env.S3_ACCESS_KEY || 'minioadmin';
    const secretAccessKey = process.env.S3_SECRET_KEY || 'minioadmin';
    const forcePathStyle =
      process.env.S3_USE_PATH_STYLE === 'true' || endpoint.includes('minio');

    this.bucket = process.env.S3_BUCKET_NAME || 'chat-files';

    // Internal S3 client for server operations
    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle, // Required for MinIO
    });

    // Public S3 client for generating browser-accessible presigned URLs
    const publicEndpoint = endpoint.replace('minio', 'localhost');
    this.publicS3Client = new S3Client({
      endpoint: publicEndpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle,
    });

    this.logger.log(
      `S3 Client initialized: endpoint=${endpoint}, publicEndpoint=${publicEndpoint}, bucket=${this.bucket}, forcePathStyle=${forcePathStyle}`,
    );

    // Initialize bucket on startup
    this.ensureBucket().catch((err) =>
      this.logger.error('Failed to ensure bucket exists:', err),
    );
  }

  private async ensureBucket() {
    if (!this.s3Client) return;

    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket '${this.bucket}' exists`);
    } catch (error: any) {
      if (error.name === 'NotFound') {
        this.logger.log(`Creating bucket '${this.bucket}'...`);
        await this.s3Client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`Bucket '${this.bucket}' created`);
      } else {
        throw error;
      }
    }
  }

  async generatePresignedUploadUrl(
    fileName: string,
    fileType: string,
  ): Promise<{ uploadUrl: string; fileUrl: string; key: string }> {
    if (!this.s3Enabled || !this.publicS3Client) {
      throw new Error('S3 storage is disabled. Enable USE_S3=true to use file upload features.');
    }

    // Generate unique key with timestamp
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `uploads/${timestamp}-${sanitizedFileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: fileType,
    });

    // Use publicS3Client to generate presigned URL with correct public endpoint
    const uploadUrl = await getSignedUrl(this.publicS3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    // Extract public endpoint from uploadUrl for consistency
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

  async generatePresignedDownloadUrl(
    key: string,
  ): Promise<{ downloadUrl: string }> {
    if (!this.s3Enabled || !this.publicS3Client) {
      throw new Error('S3 storage is disabled. Enable USE_S3=true to use file download features.');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    // Use publicS3Client to generate presigned URL with correct public endpoint
    const downloadUrl = await getSignedUrl(this.publicS3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    this.logger.log(`Generated presigned download URL for key: ${key}`);

    return { downloadUrl };
  }
}

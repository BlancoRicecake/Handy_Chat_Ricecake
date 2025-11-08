import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { StorageService } from './storage.service';
import { IsString } from 'class-validator';

class PresignedUploadDto {
  @IsString()
  fileName!: string;

  @IsString()
  fileType!: string;
}

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('presigned-upload')
  async getPresignedUploadUrl(@Body() dto: PresignedUploadDto) {
    return this.storageService.generatePresignedUploadUrl(
      dto.fileName,
      dto.fileType,
    );
  }

  @Get('presigned-download/:key(*)')
  async getPresignedDownloadUrl(@Param('key') key: string) {
    return this.storageService.generatePresignedDownloadUrl(key);
  }
}

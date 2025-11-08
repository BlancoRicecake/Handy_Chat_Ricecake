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
exports.StorageController = void 0;
const common_1 = require("@nestjs/common");
const storage_service_1 = require("./storage.service");
const class_validator_1 = require("class-validator");
class PresignedUploadDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PresignedUploadDto.prototype, "fileName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PresignedUploadDto.prototype, "fileType", void 0);
let StorageController = class StorageController {
    constructor(storageService) {
        this.storageService = storageService;
    }
    async getPresignedUploadUrl(dto) {
        return this.storageService.generatePresignedUploadUrl(dto.fileName, dto.fileType);
    }
    async getPresignedDownloadUrl(key) {
        return this.storageService.generatePresignedDownloadUrl(key);
    }
};
exports.StorageController = StorageController;
__decorate([
    (0, common_1.Post)('presigned-upload'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PresignedUploadDto]),
    __metadata("design:returntype", Promise)
], StorageController.prototype, "getPresignedUploadUrl", null);
__decorate([
    (0, common_1.Get)('presigned-download/:key(*)'),
    __param(0, (0, common_1.Param)('key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StorageController.prototype, "getPresignedDownloadUrl", null);
exports.StorageController = StorageController = __decorate([
    (0, common_1.Controller)('storage'),
    __metadata("design:paramtypes", [storage_service_1.StorageService])
], StorageController);
//# sourceMappingURL=storage.controller.js.map
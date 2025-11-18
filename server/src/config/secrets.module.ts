import { Global, Module } from '@nestjs/common';
import { SecretsService } from './secrets.service';
import { EnvValidationService } from './env-validation.service';

/**
 * Global module for secrets management
 * Provides SecretsService throughout the application
 * Validates environment variables on boot via EnvValidationService
 */
@Global()
@Module({
  providers: [SecretsService, EnvValidationService],
  exports: [SecretsService],
})
export class SecretsModule {}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * Environment Variable Validation Service
 *
 * Validates required environment variables on application boot.
 * Fails fast if critical configuration is missing or invalid.
 */
@Injectable()
export class EnvValidationService implements OnModuleInit {
  private readonly logger = new Logger(EnvValidationService.name);
  private errors: string[] = [];
  private warnings: string[] = [];

  async onModuleInit() {
    this.logger.log('Validating environment variables...');

    this.validateRequired();
    this.validateTypes();
    this.validateSpecialCharacters();

    if (this.warnings.length > 0) {
      this.logger.warn('Environment warnings:');
      this.warnings.forEach((warning) => this.logger.warn(`  ⚠️  ${warning}`));
    }

    if (this.errors.length > 0) {
      this.logger.error('Environment validation failed:');
      this.errors.forEach((error) => this.logger.error(`  ❌ ${error}`));
      throw new Error(
        `Environment validation failed with ${this.errors.length} error(s)`,
      );
    }

    this.logger.log('✅ Environment validation passed');
  }

  /**
   * Validate required environment variables
   */
  private validateRequired() {
    const required = [
      'NODE_ENV',
      'PORT',
      'MONGO_URI',
      'CORS_ORIGIN',
    ];

    // JWT secrets
    const hasJwtSecretCurrent = !!process.env.JWT_SECRET_CURRENT;
    const hasJwtSecretLegacy = !!process.env.JWT_SECRET;

    if (!hasJwtSecretCurrent && !hasJwtSecretLegacy) {
      this.errors.push('JWT_SECRET_CURRENT or JWT_SECRET is required');
    }

    // Check other required vars
    for (const varName of required) {
      if (!process.env[varName]) {
        this.errors.push(`${varName} is required`);
      }
    }

    // S3 configuration
    if (!process.env.S3_BUCKET_NAME) {
      this.errors.push('S3_BUCKET_NAME is required');
    }
  }

  /**
   * Validate environment variable types
   */
  private validateTypes() {
    // PORT
    const port = parseInt(process.env.PORT || '', 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      this.errors.push('PORT must be a valid port number (1-65535)');
    }

    // TRUST_PROXY
    const trustProxy = process.env.TRUST_PROXY;
    if (trustProxy && !['0', '1', 'true', 'false'].includes(trustProxy)) {
      this.errors.push('TRUST_PROXY must be 0, 1, true, or false');
    }

    // SECRET_CACHE_TTL
    const cacheTtl = process.env.SECRET_CACHE_TTL;
    if (cacheTtl && isNaN(parseInt(cacheTtl, 10))) {
      this.errors.push('SECRET_CACHE_TTL must be a number');
    }

    // JWT_CLOCK_TOLERANCE
    const clockTolerance = process.env.JWT_CLOCK_TOLERANCE;
    if (clockTolerance && isNaN(parseInt(clockTolerance, 10))) {
      this.errors.push('JWT_CLOCK_TOLERANCE must be a number');
    }
  }

  /**
   * Validate special characters and warn about potential issues
   */
  private validateSpecialCharacters() {
    // MongoDB URI special characters
    const mongoUri = process.env.MONGO_URI;
    if (mongoUri) {
      // Check for common unencoded special characters
      const urlPattern = /^mongodb(\+srv)?:\/\/([^:]+):([^@]+)@/;
      const match = mongoUri.match(urlPattern);

      if (match) {
        const password = match[3];

        // Check for unencoded special characters
        const specialChars = ['@', ':', '/', '?', '#', '[', ']', '!', '$', '&', "'", '(', ')', '*', '+', ',', ';', '='];
        const unencoded = specialChars.filter((char) => password.includes(char));

        if (unencoded.length > 0) {
          this.warnings.push(
            `MONGO_URI password contains special characters: ${unencoded.join(', ')}. ` +
            'Ensure they are URL encoded. Use encodeURIComponent() in JavaScript.',
          );
        }
      }
    }

    // Redis password special characters
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      const redisPattern = /^redis:\/\/:([^@]+)@/;
      const match = redisUrl.match(redisPattern);

      if (match) {
        const password = match[1];
        if (/[@:]/.test(password)) {
          this.warnings.push(
            'REDIS_URL password contains special characters. ' +
            'Ensure they are URL encoded.',
          );
        }
      }
    }

    // JWT Secret strength
    const jwtSecret = process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET;
    if (jwtSecret) {
      if (jwtSecret.length < 32) {
        this.errors.push('JWT secret must be at least 32 characters');
      }

      if (jwtSecret === 'CHANGE_THIS_TO_A_STRONG_RANDOM_SECRET_MINIMUM_32_CHARS') {
        this.errors.push('JWT secret must be changed from default value');
      }
    }

    // CORS validation
    const corsOrigin = process.env.CORS_ORIGIN;
    if (corsOrigin) {
      if (corsOrigin === '*') {
        if (process.env.NODE_ENV === 'production') {
          this.errors.push('CORS_ORIGIN cannot be "*" in production');
        } else {
          this.warnings.push('CORS_ORIGIN is "*" - acceptable for development only');
        }
      }
    }

    // S3 Endpoint validation
    const s3Endpoint = process.env.S3_ENDPOINT;
    const s3PathStyle = process.env.S3_USE_PATH_STYLE;

    if (!s3Endpoint || s3Endpoint === '') {
      // AWS S3 - path style should be false
      if (s3PathStyle === 'true') {
        this.warnings.push(
          'S3_ENDPOINT is empty (AWS S3) but S3_USE_PATH_STYLE is true. ' +
          'Should be false for AWS S3.',
        );
      }
    } else {
      // MinIO or custom endpoint - path style should be true
      if (s3PathStyle !== 'true') {
        this.warnings.push(
          'S3_ENDPOINT is set (MinIO/custom) but S3_USE_PATH_STYLE is not true. ' +
          'Should be true for MinIO.',
        );
      }
    }

    // AWS Secrets Manager validation
    const useAwsSecrets = process.env.USE_AWS_SECRETS === 'true';
    if (useAwsSecrets) {
      if (!process.env.AWS_REGION) {
        this.errors.push('AWS_REGION is required when USE_AWS_SECRETS=true');
      }
      if (!process.env.AWS_SECRET_NAME) {
        this.errors.push('AWS_SECRET_NAME is required when USE_AWS_SECRETS=true');
      }
    }
  }
}

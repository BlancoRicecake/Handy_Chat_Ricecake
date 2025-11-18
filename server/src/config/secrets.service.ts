import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { JwtSecrets, AwsSecretResponse } from './secrets.interface';

/**
 * Secrets Service with AWS Secrets Manager integration and local fallback
 *
 * Features:
 * - AWS Secrets Manager integration for production
 * - Environment variable fallback for local/staging
 * - In-memory caching with TTL
 * - Automatic cache refresh
 * - Boot validation
 */
@Injectable()
export class SecretsService implements OnModuleInit {
  private readonly logger = new Logger(SecretsService.name);
  private secretsClient: SecretsManagerClient | null = null;
  private cachedSecrets: JwtSecrets | null = null;
  private cacheExpiry: number = 0;
  private readonly cacheTTL: number;
  private readonly useAwsSecrets: boolean;
  private readonly secretName: string;
  private readonly failOpen: boolean;

  constructor() {
    this.useAwsSecrets = process.env.USE_AWS_SECRETS === 'true';
    this.secretName = process.env.AWS_SECRET_NAME || 'chat-app/jwt-secrets';
    this.cacheTTL = parseInt(process.env.SECRET_CACHE_TTL || '300000', 10); // 5 min default
    this.failOpen = process.env.AWS_SECRETS_FAIL_OPEN === 'true';

    if (this.useAwsSecrets) {
      const region = process.env.AWS_REGION || 'us-east-1';
      this.secretsClient = new SecretsManagerClient({ region });
      this.logger.log(`AWS Secrets Manager initialized (region: ${region}, secret: ${this.secretName})`);
    } else {
      this.logger.log('Using environment variable fallback for secrets');
    }
  }

  /**
   * Module initialization hook - validates secrets on boot
   */
  async onModuleInit() {
    try {
      const secrets = await this.getJwtSecrets();
      this.logger.log('JWT secrets validated successfully on boot');

      if (secrets.previous) {
        this.logger.warn('JWT secret rotation is active (previous secret present)');
      }
    } catch (error) {
      this.logger.error(`Failed to load JWT secrets on boot: ${error instanceof Error ? error.message : 'Unknown error'}`);

      if (!this.failOpen) {
        this.logger.fatal('AWS_SECRETS_FAIL_OPEN=false - shutting down application');
        throw error;
      }

      this.logger.warn('AWS_SECRETS_FAIL_OPEN=true - attempting to continue with fallback');
    }
  }

  /**
   * Get JWT secrets with rotation support
   * Uses cache if available, otherwise fetches from AWS or environment
   */
  async getJwtSecrets(): Promise<JwtSecrets> {
    // Check cache first
    if (this.cachedSecrets && Date.now() < this.cacheExpiry) {
      return this.cachedSecrets;
    }

    // Fetch fresh secrets
    let secrets: JwtSecrets;

    if (this.useAwsSecrets && this.secretsClient) {
      try {
        secrets = await this.fetchFromAws();
        this.logger.debug('Fetched secrets from AWS Secrets Manager');
      } catch (error) {
        this.logger.error(`AWS Secrets Manager fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

        if (this.failOpen) {
          this.logger.warn('Falling back to environment variables');
          secrets = this.fetchFromEnvironment();
        } else {
          throw error;
        }
      }
    } else {
      secrets = this.fetchFromEnvironment();
    }

    // Validate secrets
    this.validateSecrets(secrets);

    // Update cache
    this.cachedSecrets = secrets;
    this.cacheExpiry = Date.now() + this.cacheTTL;

    return secrets;
  }

  /**
   * Fetch secrets from AWS Secrets Manager
   */
  private async fetchFromAws(): Promise<JwtSecrets> {
    if (!this.secretsClient) {
      throw new Error('AWS Secrets Manager client not initialized');
    }

    const command = new GetSecretValueCommand({
      SecretId: this.secretName,
    });

    const response = await this.secretsClient.send(command);

    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    const secretData: AwsSecretResponse = JSON.parse(response.SecretString);

    return {
      current: secretData.current,
      previous: secretData.previous,
    };
  }

  /**
   * Fetch secrets from environment variables (fallback)
   */
  private fetchFromEnvironment(): JwtSecrets {
    const current = process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET;
    const previous = process.env.JWT_SECRET_PREVIOUS;

    if (!current) {
      throw new Error('JWT_SECRET_CURRENT or JWT_SECRET must be set in environment');
    }

    return {
      current,
      previous: previous || undefined,
    };
  }

  /**
   * Validate secret format and strength
   */
  private validateSecrets(secrets: JwtSecrets): void {
    // Check current secret
    if (!secrets.current) {
      throw new Error('Current JWT secret is missing');
    }

    if (secrets.current.length < 32) {
      throw new Error('Current JWT secret must be at least 32 characters');
    }

    if (secrets.current === 'CHANGE_THIS_TO_A_STRONG_RANDOM_SECRET_MINIMUM_32_CHARS') {
      throw new Error('JWT secret must be changed from default value');
    }

    // Check previous secret if present
    if (secrets.previous) {
      if (secrets.previous.length < 32) {
        throw new Error('Previous JWT secret must be at least 32 characters');
      }

      if (secrets.previous === secrets.current) {
        this.logger.warn('Previous and current secrets are identical - rotation may not be working correctly');
      }
    }
  }

  /**
   * Force cache refresh (useful for testing or manual rotation)
   */
  async refreshSecrets(): Promise<JwtSecrets> {
    this.cachedSecrets = null;
    this.cacheExpiry = 0;
    return this.getJwtSecrets();
  }

  /**
   * Clear cache (for testing)
   */
  clearCache(): void {
    this.cachedSecrets = null;
    this.cacheExpiry = 0;
  }
}

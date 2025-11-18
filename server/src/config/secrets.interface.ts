/**
 * JWT Secrets structure for rotation support
 */
export interface JwtSecrets {
  /**
   * Current secret used for signing new tokens
   */
  current: string;

  /**
   * Previous secret used for validation during rotation period
   * Optional - only populated during secret rotation window
   */
  previous?: string;
}

/**
 * AWS Secrets Manager response format
 * Matches the JSON structure stored in AWS Secrets Manager
 */
export interface AwsSecretResponse {
  current: string;
  previous?: string;
}

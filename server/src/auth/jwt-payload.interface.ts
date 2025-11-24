/**
 * JWT Access Token Payload
 *
 * Supports handy-platform token format with 'id' field
 */
export interface JwtPayload {
  /**
   * User ID from handy-platform (primary)
   */
  id: string;

  /**
   * Subject - User ID (optional, for compatibility)
   */
  sub?: string;

  /**
   * Username (optional)
   */
  username?: string;

  /**
   * Issued at timestamp (Unix seconds)
   */
  iat?: number;

  /**
   * Expiration timestamp (Unix seconds)
   */
  exp?: number;
}

/**
 * JWT Refresh Token Payload
 */
export interface RefreshTokenPayload {
  /**
   * Subject - User ID
   */
  sub: string;

  /**
   * Token ID for tracking/revocation
   */
  jti: string;

  /**
   * Token type
   */
  type: 'refresh';

  /**
   * Issued at timestamp (Unix seconds)
   */
  iat?: number;

  /**
   * Expiration timestamp (Unix seconds)
   */
  exp?: number;
}

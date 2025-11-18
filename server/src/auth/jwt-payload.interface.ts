/**
 * JWT Access Token Payload
 */
export interface JwtPayload {
  /**
   * Subject - User ID
   */
  sub: string;

  /**
   * Username
   */
  username: string;

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

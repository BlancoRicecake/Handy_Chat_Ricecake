/**
 * Response containing access and refresh tokens
 */
export class TokensResponse {
  /**
   * Short-lived access token (15 minutes)
   */
  accessToken: string;

  /**
   * Long-lived refresh token (7 days)
   * Only returned when ENABLE_REFRESH_TOKEN=true
   */
  refreshToken?: string;

  /**
   * Access token expiration time in seconds
   */
  expiresIn: number;
}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Refresh Token document for blacklist/revocation tracking
 * Used for multi-session support (when ENFORCE_SINGLE_SESSION=false)
 */
@Schema({ timestamps: true })
export class RefreshToken extends Document {
  /**
   * User ID this token belongs to
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /**
   * Bcrypt hash of the refresh token
   * Stored as hash for security (prevents token theft if DB is compromised)
   */
  @Prop({ required: true })
  tokenHash: string;

  /**
   * Token ID (jti) for tracking
   */
  @Prop({ required: true, unique: true })
  jti: string;

  /**
   * Token issuance timestamp
   */
  @Prop({ required: true })
  issuedAt: Date;

  /**
   * Token expiration timestamp
   */
  @Prop({ required: true, index: true })
  expiresAt: Date;

  /**
   * Revoked flag
   * Set to true on logout, password change, or security events
   */
  @Prop({ default: false, index: true })
  isRevoked: boolean;

  /**
   * Optional device/client information for tracking
   */
  @Prop({ required: false })
  deviceInfo?: string;

  /**
   * Optional IP address for security auditing
   */
  @Prop({ required: false })
  ipAddress?: string;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// TTL index - automatically delete expired tokens
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for efficient queries
RefreshTokenSchema.index({ userId: 1, isRevoked: 1 });

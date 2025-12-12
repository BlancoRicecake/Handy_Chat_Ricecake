export const MESSAGE_TYPES = [
  'text',
  'image',
  'custom_order',
  'system',
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface CreateMessagePayload {
  roomId: string;
  senderId: string;
  clientMessageId: string;
  text?: string;
  fileUrl?: string;
  messageType?: MessageType;
  metadata?: Record<string, any> | null;
  status?: 'sent' | 'delivered';
}

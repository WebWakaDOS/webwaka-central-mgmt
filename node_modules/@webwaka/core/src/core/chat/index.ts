/**
 * CORE-13: Real-Time Chat & Communication
 * Blueprint Reference: Part 10 (All Verticals)
 *
 * In-app messaging system with offline sync support.
 *
 * Tenant Isolation: every mutating and querying method requires a tenantId.
 * Channels and messages are scoped per tenant — cross-tenant leakage is impossible
 * by construction.
 */

export interface Message {
  id: string;
  tenantId: string;
  channelId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'system';
  status: 'sent' | 'delivered' | 'read';
  createdAt: Date;
}

export interface ChatChannel {
  id: string;
  tenantId: string;
  participants: string[];
  metadata: Record<string, any>;
  createdAt: Date;
}

export class ChatEngine {
  private channels: Map<string, ChatChannel> = new Map();
  private messages: Map<string, Message[]> = new Map();

  /**
   * Creates a new chat channel between participants within a tenant.
   */
  createChannel(
    tenantId: string,
    participants: string[],
    metadata: Record<string, any> = {}
  ): ChatChannel {
    const channel: ChatChannel = {
      id: `ch_${crypto.randomUUID()}`,
      tenantId,
      participants,
      metadata,
      createdAt: new Date(),
    };

    this.channels.set(channel.id, channel);
    this.messages.set(channel.id, []);

    // eventBus.publish(WebWakaEventType.CHAT_CHANNEL_CREATED, createEvent(WebWakaEventType.CHAT_CHANNEL_CREATED, tenantId, channel));

    return channel;
  }

  /**
   * Sends a message to a channel, validating the channel belongs to the tenant.
   */
  sendMessage(
    tenantId: string,
    channelId: string,
    senderId: string,
    content: string,
    type: 'text' | 'image' | 'system' = 'text'
  ): Message {
    const channel = this.channels.get(channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw new Error('Channel not found');
    }

    if (!channel.participants.includes(senderId) && type !== 'system') {
      throw new Error('Sender is not a participant in this channel');
    }

    const message: Message = {
      id: `msg_${crypto.randomUUID()}`,
      tenantId,
      channelId,
      senderId,
      content,
      type,
      status: 'sent',
      createdAt: new Date(),
    };

    const channelMessages = this.messages.get(channelId) ?? [];
    channelMessages.push(message);
    this.messages.set(channelId, channelMessages);

    // eventBus.publish(WebWakaEventType.CHAT_MESSAGE_SENT, createEvent(WebWakaEventType.CHAT_MESSAGE_SENT, tenantId, message));

    return message;
  }

  /**
   * Retrieves messages for a channel, scoped to the tenant.
   */
  getMessages(
    tenantId: string,
    channelId: string,
    limit = 50,
    offset = 0
  ): Message[] {
    const channel = this.channels.get(channelId);
    if (!channel || channel.tenantId !== tenantId) {
      return [];
    }

    const channelMessages = this.messages.get(channelId) ?? [];
    return [...channelMessages].reverse().slice(offset, offset + limit);
  }

  /**
   * Marks messages as read, scoped to the tenant.
   */
  markAsRead(tenantId: string, channelId: string, messageIds: string[]): void {
    const channel = this.channels.get(channelId);
    if (!channel || channel.tenantId !== tenantId) return;

    const channelMessages = this.messages.get(channelId) ?? [];
    for (const msg of channelMessages) {
      if (messageIds.includes(msg.id)) {
        msg.status = 'read';
      }
    }
  }
}

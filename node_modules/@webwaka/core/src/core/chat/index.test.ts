import { describe, it, expect, beforeEach } from 'vitest';
import { ChatEngine } from './index';

const T1 = 'tenant_alpha';
const T2 = 'tenant_beta';

describe('CORE-13: Real-Time Chat & Communication', () => {
  let chatEngine: ChatEngine;

  beforeEach(() => {
    chatEngine = new ChatEngine();
  });

  it('should create a chat channel', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2'], { type: 'support' });

    expect(channel.id).toMatch(/^ch_/);
    expect(channel.tenantId).toBe(T1);
    expect(channel.participants).toContain('user1');
    expect(channel.participants).toContain('user2');
    expect(channel.metadata['type']).toBe('support');
    expect(channel.createdAt).toBeInstanceOf(Date);
  });

  it('should create a channel with default empty metadata', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2']);
    expect(channel.metadata).toEqual({});
  });

  it('should send a message to a channel', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2']);

    const message = chatEngine.sendMessage(T1, channel.id, 'user1', 'Hello, world!');

    expect(message.id).toMatch(/^msg_/);
    expect(message.tenantId).toBe(T1);
    expect(message.content).toBe('Hello, world!');
    expect(message.senderId).toBe('user1');
    expect(message.status).toBe('sent');
    expect(message.type).toBe('text');
    expect(message.channelId).toBe(channel.id);
  });

  it('should not allow non-participants to send text messages', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2']);

    expect(() => {
      chatEngine.sendMessage(T1, channel.id, 'user3', 'Hello, world!');
    }).toThrow('Sender is not a participant in this channel');
  });

  it('should allow system messages from non-participants', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2']);
    const msg = chatEngine.sendMessage(T1, channel.id, 'system', 'User joined', 'system');
    expect(msg.type).toBe('system');
    expect(msg.status).toBe('sent');
  });

  it('should throw when sending to a non-existent channel', () => {
    expect(() => {
      chatEngine.sendMessage(T1, 'ch_nonexistent', 'user1', 'Hi');
    }).toThrow('Channel not found');
  });

  it('should retrieve messages for a channel in reverse order', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2']);

    chatEngine.sendMessage(T1, channel.id, 'user1', 'Message 1');
    chatEngine.sendMessage(T1, channel.id, 'user2', 'Message 2');
    chatEngine.sendMessage(T1, channel.id, 'user1', 'Message 3');

    const messages = chatEngine.getMessages(T1, channel.id);

    expect(messages).toHaveLength(3);
    expect(messages[0]!.content).toBe('Message 3');
    expect(messages[2]!.content).toBe('Message 1');
  });

  it('should support pagination with limit and offset', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2']);

    for (let i = 1; i <= 5; i++) {
      chatEngine.sendMessage(T1, channel.id, 'user1', `Message ${i}`);
    }

    const page1 = chatEngine.getMessages(T1, channel.id, 2, 0);
    expect(page1).toHaveLength(2);
    expect(page1[0]!.content).toBe('Message 5');

    const page2 = chatEngine.getMessages(T1, channel.id, 2, 2);
    expect(page2).toHaveLength(2);
    expect(page2[0]!.content).toBe('Message 3');
  });

  it('should return empty array for channel with no messages', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2']);
    expect(chatEngine.getMessages(T1, channel.id)).toHaveLength(0);
  });

  it('should mark messages as read', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2']);

    const msg1 = chatEngine.sendMessage(T1, channel.id, 'user1', 'Message 1');
    const msg2 = chatEngine.sendMessage(T1, channel.id, 'user1', 'Message 2');

    chatEngine.markAsRead(T1, channel.id, [msg1.id, msg2.id]);

    const messages = chatEngine.getMessages(T1, channel.id);
    expect(messages[0]!.status).toBe('read');
    expect(messages[1]!.status).toBe('read');
  });

  it('should only mark specified messages as read', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2']);

    const msg1 = chatEngine.sendMessage(T1, channel.id, 'user1', 'Message 1');
    chatEngine.sendMessage(T1, channel.id, 'user1', 'Message 2');

    chatEngine.markAsRead(T1, channel.id, [msg1.id]);

    const messages = chatEngine.getMessages(T1, channel.id);
    expect(messages[0]!.status).toBe('sent');
    expect(messages[1]!.status).toBe('read');
  });

  it('should send image message type', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2']);
    const msg = chatEngine.sendMessage(T1, channel.id, 'user1', 'https://img.url/photo.jpg', 'image');
    expect(msg.type).toBe('image');
  });

  // ─── Cross-Tenant Isolation ───────────────────────────────────────────────

  it('cross-tenant: tenant_B cannot send messages into tenant_A channel', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2']);

    expect(() => {
      chatEngine.sendMessage(T2, channel.id, 'user1', 'Cross-tenant hack');
    }).toThrow('Channel not found');
  });

  it('cross-tenant: tenant_B getMessages returns empty for tenant_A channel', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2']);
    chatEngine.sendMessage(T1, channel.id, 'user1', 'Secret message');

    const result = chatEngine.getMessages(T2, channel.id);
    expect(result).toHaveLength(0);
  });

  it('cross-tenant: markAsRead by tenant_B has no effect on tenant_A messages', () => {
    const channel = chatEngine.createChannel(T1, ['user1', 'user2']);
    const msg = chatEngine.sendMessage(T1, channel.id, 'user1', 'Hi');

    chatEngine.markAsRead(T2, channel.id, [msg.id]);

    const messages = chatEngine.getMessages(T1, channel.id);
    expect(messages[0]!.status).toBe('sent');
  });
});

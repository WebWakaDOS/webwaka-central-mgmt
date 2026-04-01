import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TermiiProvider, createSmsProvider, sendTermiiSms } from './sms';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function makeTermiiResponse(ok: boolean, body: Record<string, unknown>) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  });
}

describe('TermiiProvider', () => {
  const provider = new TermiiProvider('test-api-key', 'WebWaka');

  it('sendOtp succeeds via whatsapp on first attempt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message_id: 'msg-1' }),
    });
    const result = await provider.sendOtp('2348012345678', 'Your OTP is 123456');
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-1');
    expect(result.channel).toBe('whatsapp');
  });

  it('sendOtp falls back to sms when whatsapp fails', async () => {
    // First call (whatsapp) fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: 'whatsapp unavailable' }),
    });
    // Second call (sms fallback) succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message_id: 'msg-sms-1' }),
    });
    const result = await provider.sendOtp('2348012345678', 'Your OTP is 654321');
    expect(result.success).toBe(true);
    expect(result.channel).toBe('sms');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('sendOtp does not retry when channel is sms and it fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: 'sms failed' }),
    });
    const result = await provider.sendOtp('2348012345678', 'OTP', 'sms');
    expect(result.success).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sendMessage calls sendOtp with whatsapp channel', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message_id: 'msg-2' }),
    });
    const result = await provider.sendMessage('2348012345678', 'Hello');
    expect(result.success).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.channel).toBe('whatsapp');
  });

  it('returns error when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    // whatsapp fails with network error → falls back to sms
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await provider.sendOtp('2348012345678', 'OTP');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('uses whatsapp_business channel as whatsapp in Termii API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message_id: 'msg-wb' }),
    });
    await provider.sendOtp('2348012345678', 'OTP', 'whatsapp_business');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.channel).toBe('whatsapp');
  });
});

describe('createSmsProvider', () => {
  it('returns a TermiiProvider instance', () => {
    const p = createSmsProvider('key-123');
    expect(p).toBeInstanceOf(TermiiProvider);
  });

  it('accepts custom senderId', () => {
    const p = createSmsProvider('key-123', 'MyApp') as TermiiProvider;
    expect(p).toBeInstanceOf(TermiiProvider);
  });
});

describe('sendTermiiSms', () => {
  it('sends a message and returns result', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message_id: 'msg-3' }),
    });
    const result = await sendTermiiSms('2348012345678', 'Test message', 'api-key');
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-3');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterClient, createAiClient } from './ai';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

const client = new OpenRouterClient('or-test-key');

describe('OpenRouterClient.complete', () => {
  it('returns content on successful completion', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Hello from AI' } }],
        model: 'openai/gpt-4o-mini',
        usage: { total_tokens: 42 },
      }),
    });
    const result = await client.complete({
      messages: [{ role: 'user', content: 'Say hello' }],
    });
    expect(result.content).toBe('Hello from AI');
    expect(result.tokensUsed).toBe(42);
    expect(result.model).toBe('openai/gpt-4o-mini');
    expect(result.error).toBeUndefined();
  });

  it('uses custom model when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Custom model response' } }],
        model: 'anthropic/claude-3-haiku',
        usage: { total_tokens: 10 },
      }),
    });
    const result = await client.complete({
      model: 'anthropic/claude-3-haiku',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('anthropic/claude-3-haiku');
    expect(result.content).toBe('Custom model response');
  });

  it('includes maxTokens and temperature when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'ok' } }],
        model: 'openai/gpt-4o-mini',
        usage: { total_tokens: 5 },
      }),
    });
    await client.complete({
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 100,
      temperature: 0.7,
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(100);
    expect(body.temperature).toBe(0.7);
  });

  it('does not include maxTokens/temperature when not provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'ok' } }],
        model: 'openai/gpt-4o-mini',
        usage: { total_tokens: 5 },
      }),
    });
    await client.complete({
      messages: [{ role: 'user', content: 'test' }],
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it('returns error when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
    });
    const result = await client.complete({
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(result.content).toBe('');
    expect(result.tokensUsed).toBe(0);
    expect(result.error).toBe('Rate limit exceeded');
  });

  it('returns fallback error message when error.message is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });
    const result = await client.complete({
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(result.error).toBe('OpenRouter request failed');
  });

  it('returns error when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));
    const result = await client.complete({
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(result.success).toBeUndefined();
    expect(result.error).toBe('Network failure');
    expect(result.content).toBe('');
  });

  it('returns empty content when choices is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [],
        model: 'openai/gpt-4o-mini',
        usage: { total_tokens: 0 },
      }),
    });
    const result = await client.complete({
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(result.content).toBe('');
  });
});

describe('createAiClient', () => {
  it('returns an OpenRouterClient instance', () => {
    const c = createAiClient('or-key-123');
    expect(c).toBeInstanceOf(OpenRouterClient);
  });

  it('accepts custom default model', () => {
    const c = createAiClient('or-key-123', 'anthropic/claude-3-haiku');
    expect(c).toBeInstanceOf(OpenRouterClient);
  });
});

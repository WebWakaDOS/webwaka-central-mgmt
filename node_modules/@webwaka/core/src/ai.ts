export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionOptions {
  model?: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface AiCompletionResult {
  content: string;
  model: string;
  tokensUsed: number;
  error?: string;
}

export class OpenRouterClient {
  private apiKey: string;
  private defaultModel: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor(apiKey: string, defaultModel = 'openai/gpt-4o-mini') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async complete(opts: AiCompletionOptions): Promise<AiCompletionResult> {
    const model = opts.model ?? this.defaultModel;

    try {
      const body: Record<string, unknown> = {
        model,
        messages: opts.messages,
      };
      if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
      if (opts.temperature !== undefined) body.temperature = opts.temperature;

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://webwaka.com',
          'X-Title': 'WebWaka Commerce',
        },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        return {
          content: '',
          model,
          tokensUsed: 0,
          error: data?.error?.message ?? 'OpenRouter request failed',
        };
      }

      return {
        content: data.choices?.[0]?.message?.content ?? '',
        model: data.model ?? model,
        tokensUsed: data.usage?.total_tokens ?? 0,
      };
    } catch (err: any) {
      return { content: '', model, tokensUsed: 0, error: err?.message };
    }
  }
}

export function createAiClient(apiKey: string, defaultModel?: string): OpenRouterClient {
  return new OpenRouterClient(apiKey, defaultModel);
}

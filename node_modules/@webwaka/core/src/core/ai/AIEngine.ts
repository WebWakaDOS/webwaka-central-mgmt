/**
 * CORE-5: AI/BYOK Abstraction Engine
 * Blueprint Reference: Part 9.1 #7 (Vendor Neutral AI)
 *
 * Implements a three-tier fallback mechanism with per-tier retry and exponential backoff:
 *   1. Tenant BYOK (Bring Your Own Key) via OpenRouter
 *   2. Platform Key via OpenRouter
 *   3. Cloudflare Workers AI (Ultimate Fallback)
 *
 * Each tier is retried up to `maxRetries` times (default 2) before escalating.
 * Between attempts the engine sleeps for backoffMs * 2^attempt milliseconds.
 */

import { logger } from '../logger';

export interface AIRequest {
  prompt: string;
  model?: string;
  tenantId: string;
}

export interface AIResponse {
  text: string;
  provider: 'tenant-openrouter' | 'platform-openrouter' | 'cloudflare-ai';
  modelUsed: string;
}

export interface TenantConfig {
  openRouterKey?: string;
  preferredModel?: string;
}

export interface AIEngineOptions {
  /** Maximum number of retry attempts per tier before escalating. Default: 2 */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff. Default: 200 */
  backoffMs?: number;
}

export class AIEngine {
  private platformOpenRouterKey: string;
  private cloudflareAiBinding: any; // Type would be Ai from @cloudflare/workers-types
  private maxRetries: number;
  private backoffMs: number;

  constructor(
    platformOpenRouterKey: string,
    cloudflareAiBinding: any,
    options: AIEngineOptions = {}
  ) {
    this.platformOpenRouterKey = platformOpenRouterKey;
    this.cloudflareAiBinding = cloudflareAiBinding;
    this.maxRetries = options.maxRetries ?? 2;
    this.backoffMs = options.backoffMs ?? 200;
  }

  /**
   * Executes an AI request using the three-tier fallback strategy.
   * Each tier is retried up to `maxRetries` times with exponential backoff
   * before escalating to the next tier.
   */
  async execute(request: AIRequest, tenantConfig: TenantConfig): Promise<AIResponse> {
    // Tier 1: Tenant BYOK via OpenRouter
    if (tenantConfig.openRouterKey) {
      const tier1Result = await this.withRetry(
        'Tier 1 (tenant BYOK)',
        request.tenantId,
        () => this.callOpenRouter(
          request.prompt,
          tenantConfig.openRouterKey!,
          request.model ?? tenantConfig.preferredModel ?? 'openai/gpt-4o-mini',
          'tenant-openrouter'
        )
      );
      if (tier1Result !== null) return tier1Result;
    }

    // Tier 2: Platform Key via OpenRouter
    if (this.platformOpenRouterKey) {
      const tier2Result = await this.withRetry(
        'Tier 2 (platform key)',
        request.tenantId,
        () => this.callOpenRouter(
          request.prompt,
          this.platformOpenRouterKey,
          request.model ?? 'openai/gpt-4o-mini',
          'platform-openrouter'
        )
      );
      if (tier2Result !== null) return tier2Result;
    }

    // Tier 3: Cloudflare Workers AI (Ultimate Fallback — no retry needed, CF AI is durable)
    return await this.callCloudflareAI(request.prompt);
  }

  /**
   * Executes an AI request and returns a ReadableStream<Uint8Array> for
   * server-sent events streaming.
   *
   * - Tier 1 & 2: calls OpenRouter with `stream: true` and pipes `Response.body`.
   * - Tier 3 (CF AI fallback): calls `execute()` and wraps the text in a
   *   single-chunk ReadableStream (CF AI does not support streaming natively).
   */
  async executeStream(
    request: AIRequest,
    tenantConfig: TenantConfig
  ): Promise<ReadableStream<Uint8Array>> {
    // Tier 1: Tenant BYOK streaming
    if (tenantConfig.openRouterKey) {
      const tier1Result = await this.withRetry(
        'Tier 1 stream (tenant BYOK)',
        request.tenantId,
        () => this.callOpenRouterStream(
          request.prompt,
          tenantConfig.openRouterKey!,
          request.model ?? tenantConfig.preferredModel ?? 'openai/gpt-4o-mini'
        )
      );
      if (tier1Result !== null) return tier1Result;
    }

    // Tier 2: Platform Key streaming
    if (this.platformOpenRouterKey) {
      const tier2Result = await this.withRetry(
        'Tier 2 stream (platform key)',
        request.tenantId,
        () => this.callOpenRouterStream(
          request.prompt,
          this.platformOpenRouterKey,
          request.model ?? 'openai/gpt-4o-mini'
        )
      );
      if (tier2Result !== null) return tier2Result;
    }

    // Tier 3: Cloudflare AI — wrap non-streaming execute() result in a single-chunk stream
    // (CF AI does not support native streaming; this keeps fallback logic in one place)
    const fallback = await this.execute(request, tenantConfig);
    const encoder = new TextEncoder();
    const chunk = encoder.encode(fallback.text);
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });
  }

  /**
   * Runs `fn` up to `maxRetries + 1` times (1 initial attempt + maxRetries retries).
   * Emits logger.warn on each retry. Returns the result on success, or null after
   * exhausting all attempts (so the caller can escalate to the next tier).
   */
  private async withRetry<T>(
    tierLabel: string,
    tenantId: string,
    fn: () => Promise<T>
  ): Promise<T | null> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = this.backoffMs * Math.pow(2, attempt - 1);
        logger.warn(`${tierLabel} retry attempt ${attempt} after ${delayMs}ms`, {
          tenantId,
          attempt,
          delayMs,
        });
        await this.sleep(delayMs);
      }

      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          logger.warn(`${tierLabel} attempt ${attempt + 1} failed, will retry`, {
            tenantId,
            attempt: attempt + 1,
            error,
          });
        }
      }
    }

    logger.warn(`${tierLabel} exhausted all ${this.maxRetries + 1} attempts, escalating`, {
      tenantId,
      error: lastError,
    });
    return null;
  }

  /**
   * Delays execution for `ms` milliseconds.
   * Defined as a protected method so tests can spy on it via vi.spyOn(engine, 'sleep').
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async callOpenRouter(
    prompt: string,
    apiKey: string,
    model: string,
    provider: 'tenant-openrouter' | 'platform-openrouter'
  ): Promise<AIResponse> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://webwaka.com',
        'X-Title': 'WebWaka OS v4',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const content: string | undefined = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('OpenRouter returned an unexpected response structure (missing choices[0].message.content)');
    }
    return { text: content, provider, modelUsed: model };
  }

  private async callOpenRouterStream(
    prompt: string,
    apiKey: string,
    model: string
  ): Promise<ReadableStream<Uint8Array>> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://webwaka.com',
        'X-Title': 'WebWaka OS v4',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter streaming API error: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('OpenRouter returned no response body for streaming request');
    }

    return response.body;
  }

  private async callCloudflareAI(prompt: string): Promise<AIResponse> {
    if (!this.cloudflareAiBinding) {
      throw new Error('Cloudflare AI binding not configured');
    }

    const model = '@cf/meta/llama-3-8b-instruct';
    const response = await this.cloudflareAiBinding.run(model, {
      messages: [{ role: 'user', content: prompt }],
    });

    return {
      text: response.response,
      provider: 'cloudflare-ai',
      modelUsed: model,
    };
  }
}

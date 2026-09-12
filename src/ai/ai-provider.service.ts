import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Thin LLM client used by the AI features (dashboard insights, natural
 * language marketplace search). Backed by any OpenAI-compatible chat
 * completions endpoint so a key is not strictly required to run the app:
 * when no provider is configured, features fall back to deterministic,
 * data-grounded heuristic generation (see AnalyticsInsightsService).
 *
 * Never receives data that is not already owned by the caller — the
 * caller is responsible for scoping prompt payloads to a single landlord.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    const provider = config.get<string>('AI_PROVIDER', 'heuristic').toLowerCase();
    const key = config.get<string>('OPENAI_API_KEY', '');
    this.configured = provider === 'openai' && key.length > 0;
    if (provider === 'openai' && !key) {
      this.logger.warn(
        'AI_PROVIDER=openai but OPENAI_API_KEY is missing — falling back to heuristic generation',
      );
    }
  }

  /** True when a real LLM provider is configured (vs heuristic fallback). */
  isConfigured(): boolean {
    return this.configured;
  }

  currentProvider(): 'openai' | 'heuristic' {
    return this.configured ? 'openai' : 'heuristic';
  }

  /**
   * Run a completion and return the assistant's trimmed text, or null on
   * any error so callers can fall back gracefully.
   */
  async complete(messages: ChatMessage[]): Promise<string | null> {
    if (!this.configured) return null;

    const baseUrl = this.config
      .get<string>('OPENAI_BASE_URL', 'https://api.openai.com/v1')
      .replace(/\/$/, '');
    const model = this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    const key = this.config.get<string>('OPENAI_API_KEY', '');

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) {
        this.logger.warn(`LLM request failed (${res.status}) ${(await res.text()).slice(0, 200)}`);
        return null;
      }
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return body.choices?.[0]?.message?.content?.trim() ?? null;
    } catch (e) {
      this.logger.warn(`LLM request error: ${(e as Error).message}`);
      return null;
    }
  }
}

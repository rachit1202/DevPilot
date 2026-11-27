import { config } from '../../../config/env';

export interface OllamaGenerateOptions {
  prompt: string;
  system?: string;
  temperature?: number;
  numPredict?: number;
  timeoutMs?: number;
}

export interface OllamaGenerateResponse {
  response: string;
  totalDurationMs?: number;
}

/**
 * Dedicated Ollama Client for local AI inference.
 * Uses native server-side fetch with AbortController.
 */
export class OllamaClient {
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultTimeoutMs: number;

  constructor(
    baseUrl = config.OLLAMA_BASE_URL,
    defaultModel = config.OLLAMA_MODEL,
    defaultTimeoutMs = config.OLLAMA_TIMEOUT_MS
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultModel = defaultModel;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Health and connectivity probe.
   * Checks whether Ollama is reachable and running.
   */
  async checkHealth(): Promise<{ online: boolean; version?: string; error?: string }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000); // 10s health check limit

      const res = await fetch(`${this.baseUrl}/api/version`, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return { online: false, error: `Ollama returned HTTP ${res.status}` };
      }

      const data: any = await res.json();
      return { online: true, version: data.version };
    } catch (err: any) {
      return { online: false, error: err.name === 'AbortError' ? 'Health check timed out' : err.message };
    }
  }

  /**
   * Calls Ollama's /api/generate endpoint with JSON output mode.
   * Enforces configured model and AbortController timeout.
   */
  async generateCompletion(options: OllamaGenerateOptions): Promise<OllamaGenerateResponse> {
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const startTime = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.defaultModel,
          prompt: options.prompt,
          system: options.system,
          format: 'json', // Ollama grammar-constrained JSON mode
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.numPredict ?? 512,
          },
        }),
      });

      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`OLLAMA_HTTP_ERROR_${res.status}: Ollama returned status ${res.status}`);
      }

      const data: any = await res.json();
      return {
        response: data.response || '',
        totalDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`OLLAMA_TIMEOUT: Inference timed out after ${timeoutMs}ms.`);
      }
      throw err;
    }
  }

  getModel(): string {
    return this.defaultModel;
  }
}

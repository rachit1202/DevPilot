/**
 * Low-level typed Ollama HTTP client.
 * Uses native Node.js fetch with strict timeout and AbortSignal handling.
 * Does not depend on external SDKs.
 */

export interface OllamaModelTag {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface OllamaTagsResponse {
  models: OllamaModelTag[];
}

export interface OllamaVersionResponse {
  version: string;
}

export class OllamaProviderError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = 'OllamaProviderError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class OllamaClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, timeoutMs: number = 15000) {
    // Strip trailing slash if present
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  /**
   * Helper to perform fetch requests with AbortController and standard error mapping.
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });

      if (!response.ok) {
        throw new OllamaProviderError(
          `Ollama request failed with HTTP ${response.status}`,
          'OLLAMA_HTTP_ERROR',
          response.status
        );
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      if (err instanceof OllamaProviderError) {
        throw err;
      }

      const error = err as Error;
      if (error.name === 'AbortError') {
        throw new OllamaProviderError(
          `Ollama connection timed out after ${this.timeoutMs}ms`,
          'OLLAMA_TIMEOUT'
        );
      }

      // Handle connection refused or network errors safely
      throw new OllamaProviderError(
        'Unable to connect to Ollama local service. Ensure Ollama is running.',
        'OLLAMA_UNAVAILABLE'
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Verifies if Ollama is reachable by probing the root or version endpoint.
   */
  async ping(): Promise<boolean> {
    const url = `${this.baseUrl}/`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Retrieves the Ollama version string if available.
   */
  async getVersion(): Promise<string | null> {
    try {
      const data = await this.request<OllamaVersionResponse>('/api/version');
      return data.version || null;
    } catch {
      return null;
    }
  }

  /**
   * Discovers all models currently installed locally in Ollama.
   */
  async listInstalledModels(): Promise<string[]> {
    const data = await this.request<OllamaTagsResponse>('/api/tags');
    if (!data || !Array.isArray(data.models)) {
      return [];
    }
    return data.models.map((m) => m.name);
  }
}

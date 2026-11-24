import { config } from '../../config/env';
import { OllamaClient } from './providers/ollama.client';
import { AIStatusResponse } from '@devpilot/shared';

/**
 * Service managing local AI provider operations and status discovery.
 */
export class AIService {
  private static ollamaClient: OllamaClient = new OllamaClient(
    config.OLLAMA_BASE_URL,
    config.OLLAMA_TIMEOUT_MS
  );

  // Lightweight single-generation concurrency guard for future generation readiness
  private static isGenerating: boolean = false;

  /**
   * Allows overriding the Ollama client instance (primarily used in tests for mocking).
   */
  static setClient(client: OllamaClient) {
    this.ollamaClient = client;
  }

  /**
   * Resets the client to the default environment configuration.
   */
  static resetClient() {
    this.ollamaClient = new OllamaClient(config.OLLAMA_BASE_URL, config.OLLAMA_TIMEOUT_MS);
  }

  /**
   * Checks whether an AI generation is currently in progress.
   */
  static isBusy(): boolean {
    return this.isGenerating;
  }

  /**
   * Helper to match model tags accurately (handling explicit :latest or untagged equivalence).
   */
  private static matchModelTag(configuredModel: string, installedModels: string[]): boolean {
    const normalize = (tag: string) => (tag.includes(':') ? tag.toLowerCase() : `${tag.toLowerCase()}:latest`);
    const normalizedTarget = normalize(configuredModel);
    return installedModels.some((m) => normalize(m) === normalizedTarget);
  }

  /**
   * Discovers the current status of the local AI provider, checking model presence and version.
   * Does not throw if Ollama is offline; instead returns safe offline status metadata.
   */
  static async getStatus(): Promise<AIStatusResponse> {
    const isReachable = await this.ollamaClient.ping();

    if (!isReachable) {
      return {
        available: false,
        ollamaVersion: null,
        primaryModel: config.OLLAMA_MODEL,
        fallbackModel: config.OLLAMA_FALLBACK_MODEL,
        primaryModelInstalled: false,
        fallbackModelInstalled: false,
        installedModels: [],
        message: 'Ollama service is unreachable at ' + config.OLLAMA_BASE_URL + '. Verify Ollama is running locally.',
      };
    }

    let installedModels: string[] = [];
    let version: string | null = null;

    try {
      const [models, ver] = await Promise.all([
        this.ollamaClient.listInstalledModels(),
        this.ollamaClient.getVersion(),
      ]);
      installedModels = models;
      version = ver;
    } catch {
      // Return safe partial state if models discovery fails
      return {
        available: false,
        ollamaVersion: null,
        primaryModel: config.OLLAMA_MODEL,
        fallbackModel: config.OLLAMA_FALLBACK_MODEL,
        primaryModelInstalled: false,
        fallbackModelInstalled: false,
        installedModels: [],
        message: 'Ollama is running but failed to retrieve model catalog.',
      };
    }

    const primaryInstalled = this.matchModelTag(config.OLLAMA_MODEL, installedModels);
    const fallbackInstalled = this.matchModelTag(config.OLLAMA_FALLBACK_MODEL, installedModels);

    return {
      available: true,
      ollamaVersion: version,
      primaryModel: config.OLLAMA_MODEL,
      fallbackModel: config.OLLAMA_FALLBACK_MODEL,
      primaryModelInstalled: primaryInstalled,
      fallbackModelInstalled: fallbackInstalled,
      installedModels,
      message: primaryInstalled
        ? 'Ollama local AI is ready.'
        : `Ollama is running, but primary model "${config.OLLAMA_MODEL}" is not pulled. Run "ollama pull ${config.OLLAMA_MODEL}".`,
    };
  }
}

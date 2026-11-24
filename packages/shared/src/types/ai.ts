export interface AIStatusResponse {
  available: boolean;
  ollamaVersion?: string | null;
  primaryModel: string;
  fallbackModel: string;
  primaryModelInstalled: boolean;
  fallbackModelInstalled: boolean;
  installedModels: string[];
  message?: string;
}

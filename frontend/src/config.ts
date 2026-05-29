export interface AppConfig {
  apiBaseUrl: string;
  tenantId: string;
  clientId: string;
  cdnDomain: string;
  stage: string;
}

declare global {
  interface Window {
    CONFIG?: AppConfig;
  }
}

let cachedConfig: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig;
  if (window.CONFIG) {
    cachedConfig = window.CONFIG;
    return cachedConfig;
  }
  const response = await fetch('/config.json');
  if (!response.ok) {
    throw new Error(`Failed to load /config.json: ${response.status}`);
  }
  cachedConfig = (await response.json()) as AppConfig;
  return cachedConfig;
}

export function getConfig(): AppConfig {
  if (!cachedConfig) throw new Error('Config not loaded. Call loadConfig() first.');
  return cachedConfig;
}

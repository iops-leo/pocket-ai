import Conf from 'conf';

interface PocketAIConfig {
  token?: string;
  serverUrl: string;
}

const config = new Conf<PocketAIConfig>({
  projectName: 'pocket-ai',
  defaults: {
    serverUrl: 'https://pocket-ai-production.up.railway.app',
  },
});

export function getToken(): string | undefined {
  return config.get('token');
}

export function setToken(token: string): void {
  config.set('token', token);
}

export function clearToken(): void {
  config.delete('token');
}

export function getServerUrl(): string {
  return process.env.POCKET_AI_SERVER || config.get('serverUrl');
}

export function setServerUrl(url: string): void {
  config.set('serverUrl', url);
}

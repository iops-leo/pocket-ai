import Conf from 'conf';
import crypto from 'crypto';

interface SessionKeys {
  publicKey: string;  // Base64 SPKI
  privateKey: string; // Base64 PKCS8
  sessionId: string;
}

interface PocketAIConfig {
  token?: string;
  serverUrl: string;
  // 세션별 키 저장 (cwd 해시 → 키쌍)
  sessionKeys?: Record<string, SessionKeys>;
}

const config = new Conf<PocketAIConfig>({
  projectName: 'pocket-ai',
  defaults: {
    serverUrl: 'https://pocket-ai-production.up.railway.app',
  },
});

// CWD를 해시로 변환 (키 저장용)
function hashCwd(cwd: string): string {
  return crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 16);
}

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

// 세션 키 저장 (Happy 방식: 동일 cwd에서 재접속 시 동일 키 사용)
export function saveSessionKeys(cwd: string, keys: SessionKeys): void {
  const cwdHash = hashCwd(cwd);
  const sessionKeys = config.get('sessionKeys') || {};
  sessionKeys[cwdHash] = keys;
  config.set('sessionKeys', sessionKeys);
}

// 세션 키 로드
export function loadSessionKeys(cwd: string): SessionKeys | null {
  const cwdHash = hashCwd(cwd);
  const sessionKeys = config.get('sessionKeys') || {};
  return sessionKeys[cwdHash] || null;
}

// 세션 키 삭제
export function clearSessionKeys(cwd: string): void {
  const cwdHash = hashCwd(cwd);
  const sessionKeys = config.get('sessionKeys') || {};
  delete sessionKeys[cwdHash];
  config.set('sessionKeys', sessionKeys);
}

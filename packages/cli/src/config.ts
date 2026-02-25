import Conf from 'conf';
import crypto from 'crypto';

interface SessionKeys {
  publicKey: string;  // Base64 SPKI
  privateKey: string; // Base64 PKCS8
  sessionId: string;
  engine?: string;
  sessionKey?: string; // Base64 raw AES-256-GCM session key (stable for message history)
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
function hashSessionScope(cwd: string, engine: string): string {
  return crypto.createHash('sha256').update(`${cwd}::${engine}`).digest('hex').slice(0, 16);
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
export function saveSessionKeys(cwd: string, keys: SessionKeys, engine: string = 'claude'): void {
  const cwdHash = hashSessionScope(cwd, engine);
  const sessionKeys = config.get('sessionKeys') || {};
  sessionKeys[cwdHash] = {
    ...keys,
    engine,
  };
  config.set('sessionKeys', sessionKeys);
}

// 세션 키 로드
export function loadSessionKeys(cwd: string, engine: string = 'claude'): SessionKeys | null {
  const cwdHash = hashSessionScope(cwd, engine);
  const sessionKeys = config.get('sessionKeys') || {};
  const scoped = sessionKeys[cwdHash] || null;
  if (scoped) return scoped;

  // Backward compatibility: old versions keyed by cwd only (claude only).
  if (engine !== 'claude') {
    return null;
  }

  const legacyCwdHash = crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 16);
  const legacy = sessionKeys[legacyCwdHash] || null;
  if (!legacy) return null;

  // One-time migration from legacy key to claude-scoped key
  sessionKeys[cwdHash] = {
    ...legacy,
    engine: 'claude',
  };
  config.set('sessionKeys', sessionKeys);
  return sessionKeys[cwdHash];
}

// 세션 키 삭제
export function clearSessionKeys(cwd: string, engine: string = 'claude'): void {
  const cwdHash = hashSessionScope(cwd, engine);
  const sessionKeys = config.get('sessionKeys') || {};
  delete sessionKeys[cwdHash];
  if (engine === 'claude') {
    const legacyCwdHash = crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 16);
    delete sessionKeys[legacyCwdHash];
  }
  config.set('sessionKeys', sessionKeys);
}

import { io, Socket } from 'socket.io-client';
import { getServerUrl, getToken } from '../config.js';

export interface ConnectOptions {
  sessionId: string;
  publicKey: string;
  metadata: Record<string, string>;
  onSessionIdUpdate: (newSessionId: string) => void;
  onAuthSuccess: (data: { sessionId: string }) => void;
  onAuthError: (data: { error: string }) => void;
  onKeyExchange: (data: { sessionId: string; publicKey: string; sender: string }) => void;
  onUpdate: (data: any) => void;
  onDisconnect: () => void;
}

export function connectToServer(options: ConnectOptions): Socket {
  const serverUrl = getServerUrl();
  const token = getToken();

  if (!token) {
    throw new Error('Not authenticated. Run `pocket-ai login` first.');
  }

  // 현재 유효한 sessionId (서버 재시작 시 재등록 후 갱신됨)
  let currentSessionId = options.sessionId;

  const socket = io(serverUrl, {
    transports: ['websocket'], // polling 비활성화 → 로그 스팸 제거
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.on('connect', () => {
    socket.emit('client-auth', { sessionId: currentSessionId, token });
  });

  socket.on('auth-success', options.onAuthSuccess);

  socket.on('auth-error', async (data: { error: string }) => {
    if (data.error === 'Invalid session or ownership') {
      // 서버가 재시작되어 세션이 사라진 경우 → 재등록
      try {
        const newSessionId = await registerSession(options.publicKey, options.metadata);
        currentSessionId = newSessionId;
        options.onSessionIdUpdate(newSessionId);
        socket.emit('client-auth', { sessionId: currentSessionId, token });
      } catch (err: any) {
        console.error('[Pocket AI] 세션 재등록 실패:', err.message);
        options.onAuthError(data);
      }
    } else {
      options.onAuthError(data);
    }
  });

  socket.on('key-exchange', options.onKeyExchange);
  socket.on('update', options.onUpdate);
  socket.on('disconnect', options.onDisconnect);
  socket.on('connect_error', (err) => {
    // 서버 다운 시 조용히 재시도 (에러 로그 스팸 방지)
    if (process.env.DEBUG) {
      console.error(`[Pocket AI] 연결 오류: ${err.message}`);
    }
  });

  return socket;
}

export async function registerSession(publicKey: string, metadata: Record<string, string>): Promise<string> {
  const serverUrl = getServerUrl();
  const token = getToken();

  if (!token) {
    throw new Error('Not authenticated. Run `pocket-ai login` first.');
  }

  const res = await fetch(`${serverUrl}/api/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ publicKey, metadata }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Failed to register session: ${err.error}`);
  }

  const data = await res.json();
  return data.data.sessionId;
}

export async function fetchSessions(): Promise<any[]> {
  const serverUrl = getServerUrl();
  const token = getToken();

  if (!token) {
    throw new Error('Not authenticated. Run `pocket-ai login` first.');
  }

  const res = await fetch(`${serverUrl}/api/sessions`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch sessions');
  }

  const data = await res.json();
  return data.data || [];
}

import { io, Socket } from 'socket.io-client';
import { getServerUrl, getToken } from '../config.js';

export interface ConnectOptions {
  sessionId: string;
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

  const socket = io(serverUrl, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    socket.emit('client-auth', {
      sessionId: options.sessionId,
      token,
    });
  });

  socket.on('auth-success', options.onAuthSuccess);
  socket.on('auth-error', options.onAuthError);
  socket.on('key-exchange', options.onKeyExchange);
  socket.on('update', options.onUpdate);
  socket.on('disconnect', options.onDisconnect);
  socket.on('connect_error', (err) => {
    console.error(`Connection error: ${err.message}`);
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

import { describe, it, expect, beforeEach } from 'vitest';
import { activeSessions } from '../routes/sessions.js';

describe('Session Management', () => {
  beforeEach(() => {
    // Clear all sessions before each test
    activeSessions.clear();
  });

  it('should store a new session', () => {
    activeSessions.set('test-uuid-1', {
      sessionId: 'test-uuid-1',
      publicKey: 'base64key',
      status: 'offline',
      metadata: { hostname: 'test-pc', engine: 'claude' },
      userId: 'user-1',
      socketId: '',
    });

    expect(activeSessions.size).toBe(1);
    expect(activeSessions.get('test-uuid-1')?.publicKey).toBe('base64key');
  });

  it('should update session status to online', () => {
    activeSessions.set('test-uuid-1', {
      sessionId: 'test-uuid-1',
      publicKey: 'base64key',
      status: 'offline',
      metadata: {},
      userId: 'user-1',
      socketId: '',
    });

    const session = activeSessions.get('test-uuid-1')!;
    session.status = 'online';
    session.socketId = 'socket-123';

    expect(activeSessions.get('test-uuid-1')?.status).toBe('online');
    expect(activeSessions.get('test-uuid-1')?.socketId).toBe('socket-123');
  });

  it('should filter sessions by userId', () => {
    activeSessions.set('sess-1', {
      sessionId: 'sess-1', publicKey: 'k1', status: 'online',
      metadata: {}, userId: 'user-1', socketId: 's1',
    });
    activeSessions.set('sess-2', {
      sessionId: 'sess-2', publicKey: 'k2', status: 'online',
      metadata: {}, userId: 'user-2', socketId: 's2',
    });
    activeSessions.set('sess-3', {
      sessionId: 'sess-3', publicKey: 'k3', status: 'online',
      metadata: {}, userId: 'user-1', socketId: 's3',
    });

    const user1Sessions = Array.from(activeSessions.values())
      .filter(s => s.userId === 'user-1' && s.status === 'online');

    expect(user1Sessions.length).toBe(2);
  });

  it('should only return online sessions', () => {
    activeSessions.set('sess-1', {
      sessionId: 'sess-1', publicKey: 'k1', status: 'online',
      metadata: {}, userId: 'user-1', socketId: 's1',
    });
    activeSessions.set('sess-2', {
      sessionId: 'sess-2', publicKey: 'k2', status: 'offline',
      metadata: {}, userId: 'user-1', socketId: '',
    });

    const onlineSessions = Array.from(activeSessions.values())
      .filter(s => s.userId === 'user-1' && s.status === 'online');

    expect(onlineSessions.length).toBe(1);
    expect(onlineSessions[0].sessionId).toBe('sess-1');
  });

  it('should handle session disconnect (offline + offlineSince)', () => {
    activeSessions.set('sess-1', {
      sessionId: 'sess-1', publicKey: 'k1', status: 'online',
      metadata: {}, userId: 'user-1', socketId: 's1',
    });

    const session = activeSessions.get('sess-1')!;
    session.status = 'offline';
    session.socketId = '';
    session.offlineSince = Date.now();

    expect(session.status).toBe('offline');
    expect(session.offlineSince).toBeDefined();
  });

  it('should cleanup expired offline sessions', () => {
    const thirtyOneMinutesAgo = Date.now() - (31 * 60 * 1000);
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

    activeSessions.set('expired', {
      sessionId: 'expired', publicKey: 'k1', status: 'offline',
      metadata: {}, userId: 'user-1', socketId: '',
      offlineSince: thirtyOneMinutesAgo,
    });

    activeSessions.set('recent', {
      sessionId: 'recent', publicKey: 'k2', status: 'offline',
      metadata: {}, userId: 'user-1', socketId: '',
      offlineSince: fiveMinutesAgo,
    });

    activeSessions.set('online', {
      sessionId: 'online', publicKey: 'k3', status: 'online',
      metadata: {}, userId: 'user-1', socketId: 's1',
    });

    // Simulate TTL cleanup (mirrors the setInterval logic in sessions.ts)
    const SESSION_TTL_MS = 30 * 60 * 1000;
    const now = Date.now();
    for (const [sessionId, session] of activeSessions.entries()) {
      if (
        session.status === 'offline' &&
        session.offlineSince !== undefined &&
        now - session.offlineSince > SESSION_TTL_MS
      ) {
        activeSessions.delete(sessionId);
      }
    }

    expect(activeSessions.size).toBe(2);
    expect(activeSessions.has('expired')).toBe(false);
    expect(activeSessions.has('recent')).toBe(true);
    expect(activeSessions.has('online')).toBe(true);
  });

  it('should generate UUID session IDs', () => {
    const sessionId = crypto.randomUUID();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(sessionId).toMatch(uuidRegex);
  });

  it('should delete a session by sessionId', () => {
    activeSessions.set('to-delete', {
      sessionId: 'to-delete', publicKey: 'k1', status: 'offline',
      metadata: {}, userId: 'user-1', socketId: '',
    });

    expect(activeSessions.has('to-delete')).toBe(true);
    activeSessions.delete('to-delete');
    expect(activeSessions.has('to-delete')).toBe(false);
    expect(activeSessions.size).toBe(0);
  });

  it('should overwrite a session when set with the same sessionId', () => {
    activeSessions.set('sess-x', {
      sessionId: 'sess-x', publicKey: 'old-key', status: 'offline',
      metadata: {}, userId: 'user-1', socketId: '',
    });

    activeSessions.set('sess-x', {
      sessionId: 'sess-x', publicKey: 'new-key', status: 'online',
      metadata: { hostname: 'updated' }, userId: 'user-1', socketId: 'sock-99',
    });

    expect(activeSessions.size).toBe(1);
    expect(activeSessions.get('sess-x')?.publicKey).toBe('new-key');
    expect(activeSessions.get('sess-x')?.status).toBe('online');
  });

  it('should return undefined for a non-existent sessionId', () => {
    expect(activeSessions.get('ghost-session')).toBeUndefined();
  });

  it('should map multiple users sessions independently', () => {
    for (let i = 1; i <= 5; i++) {
      activeSessions.set(`sess-${i}`, {
        sessionId: `sess-${i}`,
        publicKey: `key-${i}`,
        status: i % 2 === 0 ? 'online' : 'offline',
        metadata: {},
        userId: `user-${i}`,
        socketId: i % 2 === 0 ? `sock-${i}` : '',
      });
    }

    expect(activeSessions.size).toBe(5);

    const onlineCount = Array.from(activeSessions.values())
      .filter(s => s.status === 'online').length;

    expect(onlineCount).toBe(2); // sess-2 and sess-4
  });
});

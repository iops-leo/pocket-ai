import type { SessionState } from './state.js';
import { getSessionKey, type SessionKey } from '../session-manager.js';

/**
 * 세션 풀 관리자 (Happy 스타일 멀티 세션)
 *
 * 여러 AI 세션을 동시에 관리하고 전환
 */

export interface ManagedSession {
  key: SessionKey;
  state: SessionState;
  ptyProcess: any;  // node-pty IPty instance
  socket: any;      // Socket.IO connection
}

export class SessionPool {
  private sessions = new Map<string, ManagedSession>();
  private activeSessionId: string | null = null;

  /**
   * 새 세션 추가
   */
  add(sessionId: string, session: ManagedSession): void {
    this.sessions.set(sessionId, session);
    if (!this.activeSessionId) {
      this.activeSessionId = sessionId;
    }
  }

  /**
   * 세션 제거
   */
  remove(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // PTY 프로세스 종료
    try {
      session.ptyProcess?.kill();
    } catch {}

    // Socket 연결 종료
    try {
      session.socket?.disconnect();
    } catch {}

    this.sessions.delete(sessionId);

    // 활성 세션이었다면 다른 세션으로 전환
    if (this.activeSessionId === sessionId) {
      const remaining = Array.from(this.sessions.keys());
      this.activeSessionId = remaining.length > 0 ? remaining[0] : null;
    }

    return true;
  }

  /**
   * 세션 가져오기
   */
  get(sessionId: string): ManagedSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 활성 세션 가져오기
   */
  getActive(): ManagedSession | null {
    if (!this.activeSessionId) return null;
    return this.sessions.get(this.activeSessionId) || null;
  }

  /**
   * 활성 세션 전환
   */
  setActive(sessionId: string): boolean {
    if (!this.sessions.has(sessionId)) return false;
    this.activeSessionId = sessionId;
    return true;
  }

  /**
   * 폴더+엔진으로 세션 찾기
   */
  findByKey(cwd: string, engine: string): ManagedSession | null {
    const targetKey = getSessionKey(cwd, engine);
    for (const session of this.sessions.values()) {
      if (session.key.hash === targetKey.hash) {
        return session;
      }
    }
    return null;
  }

  /**
   * 모든 세션 목록
   */
  list(): ManagedSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 세션 개수
   */
  count(): number {
    return this.sessions.size;
  }

  /**
   * 모든 세션 종료
   */
  clear(): void {
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.remove(sessionId);
    }
  }

  /**
   * 세션 상태 업데이트
   */
  updateState(sessionId: string, updates: Partial<SessionState>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.state = { ...session.state, ...updates };
    return true;
  }

  /**
   * 모든 세션 상태 (영구 저장용)
   */
  getAllStates(): Record<string, SessionState> {
    const states: Record<string, SessionState> = {};
    for (const [id, session] of this.sessions.entries()) {
      states[id] = session.state;
    }
    return states;
  }
}

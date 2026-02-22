import { getSessionKey } from '../session-manager.js';
export class SessionPool {
    sessions = new Map();
    activeSessionId = null;
    /**
     * 새 세션 추가
     */
    add(sessionId, session) {
        this.sessions.set(sessionId, session);
        if (!this.activeSessionId) {
            this.activeSessionId = sessionId;
        }
    }
    /**
     * 세션 제거
     */
    remove(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return false;
        // PTY 프로세스 종료
        try {
            session.ptyProcess?.kill();
        }
        catch { }
        // Socket 연결 종료
        try {
            session.socket?.disconnect();
        }
        catch { }
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
    get(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * 활성 세션 가져오기
     */
    getActive() {
        if (!this.activeSessionId)
            return null;
        return this.sessions.get(this.activeSessionId) || null;
    }
    /**
     * 활성 세션 전환
     */
    setActive(sessionId) {
        if (!this.sessions.has(sessionId))
            return false;
        this.activeSessionId = sessionId;
        return true;
    }
    /**
     * 폴더+엔진으로 세션 찾기
     */
    findByKey(cwd, engine) {
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
    list() {
        return Array.from(this.sessions.values());
    }
    /**
     * 세션 개수
     */
    count() {
        return this.sessions.size;
    }
    /**
     * 모든 세션 종료
     */
    clear() {
        for (const sessionId of Array.from(this.sessions.keys())) {
            this.remove(sessionId);
        }
    }
    /**
     * 세션 상태 업데이트
     */
    updateState(sessionId, updates) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return false;
        session.state = { ...session.state, ...updates };
        return true;
    }
    /**
     * 모든 세션 상태 (영구 저장용)
     */
    getAllStates() {
        const states = {};
        for (const [id, session] of this.sessions.entries()) {
            states[id] = session.state;
        }
        return states;
    }
}

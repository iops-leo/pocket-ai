import type { SessionState } from './state.js';
import { type SessionKey } from '../session-manager.js';
/**
 * 세션 풀 관리자 (Happy 스타일 멀티 세션)
 *
 * 여러 AI 세션을 동시에 관리하고 전환
 */
export interface ManagedSession {
    key: SessionKey;
    state: SessionState;
    ptyProcess: any;
    socket: any;
}
export declare class SessionPool {
    private sessions;
    private activeSessionId;
    /**
     * 새 세션 추가
     */
    add(sessionId: string, session: ManagedSession): void;
    /**
     * 세션 제거
     */
    remove(sessionId: string): boolean;
    /**
     * 세션 가져오기
     */
    get(sessionId: string): ManagedSession | undefined;
    /**
     * 활성 세션 가져오기
     */
    getActive(): ManagedSession | null;
    /**
     * 활성 세션 전환
     */
    setActive(sessionId: string): boolean;
    /**
     * 폴더+엔진으로 세션 찾기
     */
    findByKey(cwd: string, engine: string): ManagedSession | null;
    /**
     * 모든 세션 목록
     */
    list(): ManagedSession[];
    /**
     * 세션 개수
     */
    count(): number;
    /**
     * 모든 세션 종료
     */
    clear(): void;
    /**
     * 세션 상태 업데이트
     */
    updateState(sessionId: string, updates: Partial<SessionState>): boolean;
    /**
     * 모든 세션 상태 (영구 저장용)
     */
    getAllStates(): Record<string, SessionState>;
}

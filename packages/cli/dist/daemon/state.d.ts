/**
 * 데몬 상태 관리 (Happy 스타일)
 *
 * ~/.pocket-ai/daemon-state.json에 영구 저장
 */
export interface SessionState {
    id: string;
    cwd: string;
    engine: string;
    pid: number | null;
    createdAt: number;
    lastActiveAt: number;
    status: 'active' | 'paused' | 'stopped';
}
export interface DaemonState {
    pid: number;
    startedAt: number;
    sessions: Record<string, SessionState>;
    ipcSocketPath: string;
}
/**
 * 데몬 상태 로드
 */
export declare function loadDaemonState(): Promise<DaemonState | null>;
/**
 * 데몬 상태 저장
 */
export declare function saveDaemonState(state: DaemonState): Promise<void>;
/**
 * 데몬 PID 저장
 */
export declare function saveDaemonPid(pid: number): Promise<void>;
/**
 * 데몬 PID 로드
 */
export declare function loadDaemonPid(): Promise<number | null>;
/**
 * 데몬 상태 초기화
 */
export declare function initDaemonState(pid: number, ipcSocketPath: string): Promise<DaemonState>;
/**
 * 데몬 상태 삭제
 */
export declare function clearDaemonState(): Promise<void>;
/**
 * 데몬이 실행 중인지 확인
 */
export declare function isDaemonRunning(): Promise<boolean>;
/**
 * 상태 파일 경로들
 */
export declare const STATE_PATHS: {
    dir: string;
    state: string;
    pid: string;
};

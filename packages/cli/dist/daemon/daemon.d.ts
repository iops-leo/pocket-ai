/**
 * Pocket AI 데몬 (Happy 스타일)
 *
 * 백그라운드에서 여러 AI 세션을 관리
 */
export declare class Daemon {
    private sessionPool;
    private ipcServer;
    private running;
    constructor();
    /**
     * 데몬 시작
     */
    start(): Promise<void>;
    /**
     * IPC 메시지 핸들러
     */
    private handleIPCMessage;
    /**
     * 세션 시작
     */
    private handleStartSession;
    /**
     * 세션 중지
     */
    private handleStopSession;
    /**
     * 세션 전환
     */
    private handleSwitchSession;
    /**
     * 세션 목록
     */
    private handleListSessions;
    /**
     * 데몬 상태
     */
    private handleGetStatus;
    /**
     * 상태 저장
     */
    private saveState;
    /**
     * 데몬 종료
     */
    private shutdown;
}
/**
 * 데몬 프로세스 엔트리포인트
 */
export declare function runDaemon(): Promise<void>;

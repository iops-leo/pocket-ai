import type { IPCMessage, IPCResponse } from '../daemon/ipc-server.js';
/**
 * 데몬 클라이언트
 *
 * CLI에서 데몬과 통신
 */
export declare class DaemonClient {
    private socketPath;
    /**
     * 데몬이 실행 중인지 확인하고 소켓 경로 로드
     */
    ensureConnected(): Promise<boolean>;
    /**
     * IPC 메시지 전송
     */
    send(message: IPCMessage): Promise<IPCResponse>;
    /**
     * 세션 시작 요청
     */
    startSession(cwd: string, engine: string): Promise<{
        sessionId: string;
        resumed: boolean;
    }>;
    /**
     * 세션 중지 요청
     */
    stopSession(sessionId: string): Promise<void>;
    /**
     * 세션 전환 요청
     */
    switchSession(sessionId: string): Promise<void>;
    /**
     * 세션 목록 조회
     */
    listSessions(): Promise<any[]>;
    /**
     * 데몬 상태 조회
     */
    getStatus(): Promise<any>;
    /**
     * 데몬 종료 요청
     */
    shutdown(): Promise<void>;
}

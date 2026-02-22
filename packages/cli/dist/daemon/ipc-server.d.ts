/**
 * IPC 서버 (Unix Domain Socket)
 *
 * CLI ↔ Daemon 간 통신
 */
export interface IPCMessage {
    type: 'start-session' | 'stop-session' | 'switch-session' | 'list-sessions' | 'get-status' | 'shutdown';
    payload?: any;
}
export interface IPCResponse {
    success: boolean;
    data?: any;
    error?: string;
}
export type IPCHandler = (message: IPCMessage) => Promise<IPCResponse>;
export declare class IPCServer {
    private server;
    private socketPath;
    private handler;
    constructor(handler: IPCHandler);
    /**
     * IPC 서버 시작
     */
    start(): Promise<string>;
    /**
     * 클라이언트 연결 처리
     */
    private handleConnection;
    /**
     * IPC 서버 중지
     */
    stop(): Promise<void>;
    getSocketPath(): string;
}

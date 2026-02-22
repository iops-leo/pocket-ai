import { Socket } from 'socket.io-client';
export interface ConnectOptions {
    sessionId: string;
    publicKey: string;
    metadata: Record<string, string>;
    onSessionIdUpdate: (newSessionId: string) => void;
    onAuthSuccess: (data: {
        sessionId: string;
    }) => void;
    onAuthError: (data: {
        error: string;
    }) => void;
    onKeyExchange: (data: {
        sessionId: string;
        publicKey: string;
        sender: string;
    }) => void;
    onUpdate: (data: any) => void;
    onDisconnect: () => void;
}
export declare function connectToServer(options: ConnectOptions): Socket;
export declare function registerSession(publicKey: string, metadata: Record<string, string>): Promise<string>;
export declare function fetchSessions(): Promise<any[]>;

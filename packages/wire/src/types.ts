export type SessionMessageType = 'text' | 'tool-call' | 'tool-result' | 'session-event';

export interface SessionMessageText {
    t: 'text';
    text: string;
}

export interface SessionMessageToolCall {
    t: 'tool-call';
    id: string;
    name: string;
    arguments: string;
}

export interface SessionMessageToolResult {
    t: 'tool-result';
    id: string;
    result: string;
    error?: string;
}

export interface SessionEventMessage {
    t: 'session-event';
    event: 'typing' | 'stopped-typing' | 'processing';
}

export type SessionPayload =
    | SessionMessageText
    | SessionMessageToolCall
    | SessionMessageToolResult
    | SessionEventMessage;

/**
 * Standard REST API response format.
 */
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
}

/** Key exchange message for ECDH public key sharing */
export interface KeyExchangeMessage {
    sessionId: string;
    publicKey: string;
    sender: 'cli' | 'pwa';
}

/** Encrypted update message relayed through server */
export interface UpdateMessage {
    sessionId: string;
    sender: 'cli' | 'pwa';
    body: {
        cipher: string;
        iv: string;
    };
}

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

/** Encrypted body container (AES-256-GCM) */
export interface EncryptedBody {
    cipher: string;  // Base64 encoded ciphertext
    iv: string;      // Base64 encoded IV
}

/** Encrypted update message relayed through server */
export interface UpdateMessage {
    sessionId: string;
    sender: 'cli' | 'pwa';
    body: EncryptedBody;
}

/** Message record stored in database (server-side) */
export interface MessageRecord {
    id: string;
    sessionId: string;
    seq: number;
    sender: 'cli' | 'pwa';
    encryptedBody: EncryptedBody;
    createdAt: string;  // ISO8601
}

/** Paginated messages response */
export interface MessagesResponse {
    messages: MessageRecord[];
    hasMore: boolean;
    nextCursor?: number;  // seq number for pagination
}

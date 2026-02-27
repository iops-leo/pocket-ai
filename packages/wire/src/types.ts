export type SessionMessageType = 'text' | 'tool-call' | 'tool-result' | 'session-event' | 'input-request' | 'input-response';

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
    event: 'typing' | 'stopped-typing' | 'processing' | 'interrupt';
}

/** Claude가 도구 사용 권한 또는 선택지를 요청할 때 PWA로 전송 */
export interface SessionMessageInputRequest {
    t: 'input-request';
    requestId: string;
    requestType: 'permission' | 'selection';
    toolName?: string;
    toolInput?: string;
    message?: string;
    options?: string[];
}

/** PWA에서 권한 응답 또는 선택지 응답을 CLI로 전송 */
export interface SessionMessageInputResponse {
    t: 'input-response';
    requestId: string;
    approved: boolean;
    selectedOption?: string;
    message?: string;
}

export type SessionPayload =
    | SessionMessageText
    | SessionMessageToolCall
    | SessionMessageToolResult
    | SessionEventMessage
    | SessionMessageInputRequest
    | SessionMessageInputResponse;

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

/** Session key message — wrapped session key delivered via ECDH shared secret */
export interface SessionKeyMessage {
    sessionId: string;
    wrappedKey: EncryptedBody;  // ECDH shared secret으로 wrap된 session key
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

import type { SessionPayload, SessionMessageInputRequest } from '@pocket-ai/wire';
/**
 * Claude Code JSON 스트리밍 브릿지
 *
 * Claude Code CLI를 --output-format stream-json --input-format stream-json
 * --permission-prompt-tool stdio 모드로 실행하여 구조화된 JSON 양방향 통신을 수행한다.
 *
 * Happy 프로젝트의 query.ts 패턴 참고:
 * https://github.com/slopus/happy/blob/main/packages/happy-cli/src/claude/sdk/query.ts
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'planMode' | 'yolo';
export interface ClaudeStreamOptions {
    cwd: string;
    sessionId?: string;
    headless?: boolean;
    onMessage: (event: SessionPayload) => void;
    onPermissionRequest: (request: SessionMessageInputRequest) => void;
    onReady: () => void;
    onSessionId?: (claudeSessionId: string) => void;
    onExit: (code: number) => void;
}
export declare class ClaudeStreamBridge {
    private child;
    private pendingPermissions;
    private options;
    private destroyed;
    private claudeSessionId;
    private waitingForInput;
    private permissionMode;
    setPermissionMode(mode: PermissionMode): void;
    getPermissionMode(): PermissionMode;
    constructor(options: ClaudeStreamOptions);
    /**
     * Claude 프로세스를 JSON 스트리밍 모드로 스폰한다.
     */
    start(): void;
    /**
     * PWA 또는 로컬 stdin에서 온 사용자 메시지를 Claude에 전달한다.
     */
    sendMessage(text: string): void;
    /**
     * PWA에서 온 권한 응답을 Claude에 전달한다.
     */
    respondToPermission(requestId: string, approved: boolean, message?: string): void;
    /**
     * Claude에 인터럽트를 보낸다.
     */
    interrupt(): void;
    /**
     * Claude 프로세스를 종료한다.
     */
    kill(): void;
    get isWaitingForInput(): boolean;
    get sessionId(): string | null;
    /** 현재 응답 대기 중인 permission 요청 목록 반환 (PWA 재연결 시 재전송용) */
    getPendingInputRequests(): SessionMessageInputRequest[];
    private handleMessage;
    private handleAssistantMessage;
    private handleUserMessage;
    private handleControlRequest;
    private writeJson;
}

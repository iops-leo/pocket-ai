import type { SessionPayload } from '@pocket-ai/wire';
/**
 * Codex SDK 브릿지
 *
 * @openai/codex-sdk의 startThread() + runStreamed() API를 사용하여
 * Codex 에이전트와 구조화된 이벤트 기반 통신을 수행한다.
 * ClaudeStreamBridge와 동일한 인터페이스 패턴.
 */
export interface CodexSdkBridgeOptions {
    cwd: string;
    headless?: boolean;
    onMessage: (event: SessionPayload) => void;
    onReady: () => void;
    onExit: (code: number) => void;
}
export declare class CodexSdkBridge {
    private thread;
    private options;
    private destroyed;
    private abortController;
    private _isWaitingForInput;
    private threadId;
    private running;
    constructor(options: CodexSdkBridgeOptions);
    get isWaitingForInput(): boolean;
    /**
     * Codex SDK 인스턴스와 Thread를 초기화한다.
     */
    start(): Promise<void>;
    /**
     * 사용자 메시지를 Codex에 전달하고 스트리밍 이벤트를 처리한다.
     */
    sendMessage(text: string): Promise<void>;
    /**
     * 현재 실행 중인 요청을 중단한다.
     */
    interrupt(): void;
    /**
     * 브릿지를 정리한다.
     */
    kill(): void;
    private handleEvent;
    private handleItemStarted;
    private handleItemCompleted;
}

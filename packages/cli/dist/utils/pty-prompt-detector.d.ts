import type { SessionMessageInputRequest } from '@pocket-ai/wire';
export declare class PtyPromptDetector {
    private buffer;
    private engine;
    private patterns;
    private pendingRequestId;
    private pendingPattern;
    private onPromptDetected;
    private requestCounter;
    constructor(engine: 'codex' | 'gemini', onPromptDetected: (request: SessionMessageInputRequest) => void);
    feed(data: string): void;
    respond(requestId: string, approved: boolean): string | null;
}

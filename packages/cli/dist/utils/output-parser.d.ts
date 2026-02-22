import type { SessionPayload } from '@pocket-ai/wire';
export declare class ClaudeOutputParser {
    private lineBuffer;
    private currentToolId;
    private toolOutputLines;
    /** Last streamed (non-\n) text emitted — for delta deduplication */
    private lastStreamText;
    feed(rawChunk: string): SessionPayload[];
    /**
     * Peek at the current lineBuffer content and emit any new streaming text.
     * Does NOT clear lineBuffer (it will be cleared when \n eventually arrives).
     * Uses delta encoding so duplicate content is never sent.
     */
    private peekStreamBuffer;
    flush(): SessionPayload[];
}

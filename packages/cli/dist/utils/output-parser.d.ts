import type { SessionPayload } from '@pocket-ai/wire';
export declare class ClaudeOutputParser {
    private lineBuffer;
    private currentToolId;
    private toolOutputLines;
    feed(rawChunk: string): SessionPayload[];
    flush(): SessionPayload[];
}

import type { SessionMessageInputRequest } from '@pocket-ai/wire';

interface PromptPattern {
    detect: RegExp;
    extract: (buffer: string) => { toolName?: string; message?: string };
    approveKey: string;
    denyKey: string;
}

function stripAnsi(input: string): string {
    return input.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

const CODEX_PATTERNS: PromptPattern[] = [
    {
        detect: /Press Enter to confirm|press enter to run|Press enter to execute/i,
        extract: (buf) => {
            const cmdMatch = buf.match(/(?:Run command|run|execute|apply patch)[:\s]*[`"]?(.+?)[`"]?\s*(?:\n|$)/i);
            return {
                toolName: 'Bash',
                message: cmdMatch?.[1]?.trim() || 'Codex wants to execute a command',
            };
        },
        approveKey: '\r',
        denyKey: '\x1B',
    },
];

const GEMINI_PATTERNS: PromptPattern[] = [
    {
        detect: /Approve\?|Do you want to|Confirm write|allow this action/i,
        extract: (buf) => {
            const lines = buf.split('\n').filter(l => l.trim());
            const contextLines = lines.slice(-5).join('\n').trim();
            const toolMatch = contextLines.match(/(?:execute|run|write|edit|create|read|delete)\s+[`"]?(.+?)[`"]?/i);
            return {
                toolName: toolMatch ? 'Tool' : undefined,
                message: contextLines || 'Gemini requests permission',
            };
        },
        approveKey: 'y\r',
        denyKey: 'n\r',
    },
];

const MAX_BUFFER = 2000;

export class PtyPromptDetector {
    private buffer = '';
    private engine: 'codex' | 'gemini';
    private patterns: PromptPattern[];
    private pendingRequestId: string | null = null;
    private pendingPattern: PromptPattern | null = null;
    private onPromptDetected: (request: SessionMessageInputRequest) => void;
    private requestCounter = 0;

    constructor(
        engine: 'codex' | 'gemini',
        onPromptDetected: (request: SessionMessageInputRequest) => void,
    ) {
        this.engine = engine;
        this.patterns = engine === 'codex' ? CODEX_PATTERNS : GEMINI_PATTERNS;
        this.onPromptDetected = onPromptDetected;
    }

    feed(data: string): void {
        const clean = stripAnsi(data);
        this.buffer += clean;

        if (this.buffer.length > MAX_BUFFER) {
            this.buffer = this.buffer.slice(-MAX_BUFFER);
        }

        // Skip detection while a prompt is already pending
        if (this.pendingRequestId) return;

        for (const pattern of this.patterns) {
            if (pattern.detect.test(this.buffer)) {
                this.requestCounter += 1;
                const requestId = `pty-${this.engine}-${this.requestCounter}`;
                const extracted = pattern.extract(this.buffer);

                this.pendingRequestId = requestId;
                this.pendingPattern = pattern;
                this.buffer = '';

                this.onPromptDetected({
                    t: 'input-request',
                    requestId,
                    requestType: 'permission',
                    toolName: extracted.toolName,
                    message: extracted.message,
                });
                return;
            }
        }
    }

    respond(requestId: string, approved: boolean): string | null {
        if (this.pendingRequestId !== requestId || !this.pendingPattern) {
            return null;
        }

        const key = approved ? this.pendingPattern.approveKey : this.pendingPattern.denyKey;
        this.pendingRequestId = null;
        this.pendingPattern = null;
        return key;
    }
}

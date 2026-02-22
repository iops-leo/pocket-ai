import type { SessionPayload } from '@pocket-ai/wire';
/**
 * Watches Claude Code's JSONL session transcript and emits structured events.
 *
 * Claude Code writes a per-session JSONL file at:
 *   ~/.claude/projects/{escaped-cwd}/{session-uuid}.jsonl
 *
 * Each line is a JSON object with type 'assistant', 'user', 'system', etc.
 * We watch for 'assistant' entries (AI text + tool calls) and 'user'
 * entries (tool results), emitting clean SessionPayload events.
 *
 * This is far more reliable than parsing PTY ANSI output since Claude Code
 * re-renders the full screen on every streaming token, making ANSI parsing
 * inherently ambiguous.
 */
export declare class ClaudeSessionWatcher {
    private projectDir;
    private sessionFile;
    private fileOffset;
    private onEvent;
    private startTime;
    private seenUuids;
    private destroyed;
    private pollTimeout;
    /** Returns the Claude Code session UUID (extracted from JSONL filename), or null if not found yet */
    get sessionId(): string | null;
    constructor(cwd: string, onEvent: (events: SessionPayload[]) => void);
    start(): void;
    private schedulePoll;
    private findSessionFile;
    private readNewLines;
    private processLine;
    destroy(): void;
}

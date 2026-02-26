import type { SessionPayload } from '@pocket-ai/wire';
export interface SessionTranscriptWatcher {
    start(): void;
    destroy(): void;
}
/**
 * Watches Claude Code's JSONL session transcript and emits structured events.
 */
export declare class ClaudeSessionWatcher implements SessionTranscriptWatcher {
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
    /**
     * Read recent history from JSONL file (for PWA history restore).
     */
    readHistory(limit?: number): SessionPayload[];
}
/**
 * Watches Codex CLI session JSONL transcript in ~/.codex/sessions/YYYY/MM/DD.
 */
export declare class CodexSessionWatcher implements SessionTranscriptWatcher {
    private sessionsRoot;
    private cwd;
    private sessionFile;
    private sessionId;
    private fileOffset;
    private startTimeMs;
    private onEvent;
    private destroyed;
    private pollTimeout;
    private syntheticCallIndex;
    private seenLineHashes;
    constructor(cwd: string, onEvent: (events: SessionPayload[]) => void);
    start(): void;
    destroy(): void;
    private schedulePoll;
    private getCandidateDateDirs;
    private listCandidates;
    private readSessionMeta;
    private findSessionFile;
    private readNewLines;
    private nextSyntheticCallId;
    private decodeToolOutput;
    private processLine;
}
/**
 * Watches Gemini CLI chat transcript in ~/.gemini/tmp/<projectHash>/chats/session-*.json.
 */
export declare class GeminiSessionWatcher implements SessionTranscriptWatcher {
    private cwd;
    private chatsDirs;
    private startTimeMs;
    private onEvent;
    private sessionFile;
    private seenMessageIds;
    private destroyed;
    private pollTimeout;
    private lastMtimeMs;
    constructor(cwd: string, onEvent: (events: SessionPayload[]) => void);
    start(): void;
    destroy(): void;
    private schedulePoll;
    private resolveCandidateChatsDirs;
    private listSessionCandidates;
    private findSessionFile;
    private parseGeminiMessage;
    private readSessionUpdates;
}
export declare function createSessionTranscriptWatcher(engine: string, cwd: string, onEvent: (events: SessionPayload[]) => void): SessionTranscriptWatcher | null;

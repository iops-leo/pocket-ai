import fs from 'fs';
import path from 'path';
import os from 'os';
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
export class ClaudeSessionWatcher {
    private projectDir: string;
    private sessionFile: string | null = null;
    private fileOffset = 0;
    private onEvent: (events: SessionPayload[]) => void;
    private startTime: number;
    private seenUuids = new Set<string>();
    private destroyed = false;
    private pollTimeout: ReturnType<typeof setTimeout> | null = null;

    /** Returns the Claude Code session UUID (extracted from JSONL filename), or null if not found yet */
    get sessionId(): string | null {
        if (!this.sessionFile) return null;
        // Filename is {session-uuid}.jsonl
        const basename = path.basename(this.sessionFile, '.jsonl');
        return basename || null;
    }

    constructor(cwd: string, onEvent: (events: SessionPayload[]) => void) {
        this.onEvent = onEvent;
        this.startTime = Date.now();
        // Claude Code escapes the CWD by replacing all / and \ with -
        // e.g. /Users/leo/project → -Users-leo-project
        const escapedCwd = cwd.replace(/[/\\]/g, '-');
        this.projectDir = path.join(os.homedir(), '.claude', 'projects', escapedCwd);
    }

    start(): void {
        // Give Claude Code ~1.5s to initialize and create its session file
        this.schedulePoll(1500);
    }

    private schedulePoll(delayMs = 500): void {
        if (this.destroyed) return;
        this.pollTimeout = setTimeout(() => {
            if (this.destroyed) return;
            if (this.sessionFile) {
                this.readNewLines();
            } else {
                this.findSessionFile();
            }
            this.schedulePoll();
        }, delayMs);
    }

    private findSessionFile(): void {
        try {
            const files = fs.readdirSync(this.projectDir);
            const candidates = files
                .filter(f => f.endsWith('.jsonl'))
                .map(f => {
                    const fp = path.join(this.projectDir, f);
                    try { return { fp, mtime: fs.statSync(fp).mtimeMs }; }
                    catch { return null; }
                })
                .filter((f): f is { fp: string; mtime: number } => f !== null)
                // Only files created/modified after we started (with 30s tolerance)
                .filter(f => f.mtime >= this.startTime - 30_000)
                .sort((a, b) => b.mtime - a.mtime);

            if (candidates.length > 0) {
                this.sessionFile = candidates[0].fp;
                // Skip entries that existed BEFORE we started watching.
                // fileOffset = 0 would re-send old local-CLI conversation history to PWA.
                try {
                    this.fileOffset = fs.statSync(candidates[0].fp).size;
                } catch {
                    this.fileOffset = 0;
                }
            }
        } catch { /* directory not created yet */ }
    }

    private readNewLines(): void {
        if (!this.sessionFile) return;
        try {
            const stat = fs.statSync(this.sessionFile);
            if (stat.size <= this.fileOffset) return;

            const fd = fs.openSync(this.sessionFile, 'r');
            const buf = Buffer.alloc(stat.size - this.fileOffset);
            fs.readSync(fd, buf, 0, buf.length, this.fileOffset);
            fs.closeSync(fd);

            this.fileOffset = stat.size;

            for (const line of buf.toString('utf-8').split('\n')) {
                const trimmed = line.trim();
                if (trimmed) this.processLine(trimmed);
            }
        } catch { /* file temporarily unavailable */ }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private processLine(line: string): void {
        let entry: any;
        try { entry = JSON.parse(line); } catch { return; }
        if (!entry || typeof entry !== 'object') return;

        // Deduplicate by UUID (entries can appear during partial reads)
        if (entry.uuid) {
            if (this.seenUuids.has(entry.uuid)) return;
            this.seenUuids.add(entry.uuid);
        }

        const events: SessionPayload[] = [];

        // AI response: text blocks + tool_use blocks
        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
            for (const block of entry.message.content) {
                if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
                    events.push({ t: 'text', text: block.text });
                } else if (block.type === 'tool_use') {
                    const args = block.input != null ? JSON.stringify(block.input) : '';
                    events.push({ t: 'tool-call', id: block.id, name: block.name, arguments: args });
                }
            }
        }

        // Tool results: user-turn tool_result blocks
        if (entry.type === 'user' && Array.isArray(entry.message?.content)) {
            for (const block of entry.message.content) {
                if (block.type === 'tool_result') {
                    const result = typeof block.content === 'string'
                        ? block.content
                        : Array.isArray(block.content)
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            ? block.content.map((c: any) => (typeof c.text === 'string' ? c.text : '')).join('\n')
                            : '';
                    events.push({ t: 'tool-result', id: block.tool_use_id, result });
                }
            }
        }

        if (events.length > 0) {
            this.onEvent(events);
        }
    }

    destroy(): void {
        this.destroyed = true;
        if (this.pollTimeout) {
            clearTimeout(this.pollTimeout);
            this.pollTimeout = null;
        }
    }
}

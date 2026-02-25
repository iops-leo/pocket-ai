import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { SessionPayload } from '@pocket-ai/wire';

export interface SessionTranscriptWatcher {
    start(): void;
    destroy(): void;
}

interface FileCandidate {
    filePath: string;
    mtimeMs: number;
}

interface CodexSessionMeta {
    cwd: string;
    sessionId?: string;
    startTimeMs: number;
}

function safeJsonParse<T>(raw: string): T | null {
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function ensureText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        return value
            .map((item) => ensureText(item))
            .filter(Boolean)
            .join('\n');
    }
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record.text === 'string') return record.text;
        if (typeof record.content === 'string') return record.content;
    }
    return '';
}

function parseIsoMs(value: unknown): number {
    if (typeof value !== 'string') return 0;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
}

function hashPath(inputPath: string): string {
    return crypto.createHash('sha256').update(inputPath).digest('hex');
}

/**
 * Watches Claude Code's JSONL session transcript and emits structured events.
 */
export class ClaudeSessionWatcher implements SessionTranscriptWatcher {
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
        const basename = path.basename(this.sessionFile, '.jsonl');
        return basename || null;
    }

    constructor(cwd: string, onEvent: (events: SessionPayload[]) => void) {
        this.onEvent = onEvent;
        this.startTime = Date.now();
        const escapedCwd = cwd.replace(/[/\\]/g, '-');
        this.projectDir = path.join(os.homedir(), '.claude', 'projects', escapedCwd);
    }

    start(): void {
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
                .filter(f => f.mtime >= this.startTime - 30_000)
                .sort((a, b) => b.mtime - a.mtime);

            if (candidates.length > 0) {
                this.sessionFile = candidates[0].fp;
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

        if (entry.uuid) {
            if (this.seenUuids.has(entry.uuid)) return;
            this.seenUuids.add(entry.uuid);
        }

        const events: SessionPayload[] = [];

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

    /**
     * Read recent history from JSONL file (for PWA history restore).
     */
    readHistory(limit: number = 50): SessionPayload[] {
        if (!this.sessionFile) return [];

        const events: SessionPayload[] = [];
        try {
            const content = fs.readFileSync(this.sessionFile, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());

            for (const line of lines) {
                if (events.length >= limit) break;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let entry: any;
                try { entry = JSON.parse(line); } catch { continue; }
                if (!entry || typeof entry !== 'object') continue;

                if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
                    for (const block of entry.message.content) {
                        if (events.length >= limit) break;
                        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
                            events.push({ t: 'text', text: block.text });
                        } else if (block.type === 'tool_use') {
                            const args = block.input != null ? JSON.stringify(block.input) : '';
                            events.push({ t: 'tool-call', id: block.id, name: block.name, arguments: args });
                        }
                    }
                }

                if (entry.type === 'user' && Array.isArray(entry.message?.content)) {
                    for (const block of entry.message.content) {
                        if (events.length >= limit) break;
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
            }
        } catch {
            // ignore
        }

        return events;
    }
}

/**
 * Watches Codex CLI session JSONL transcript in ~/.codex/sessions/YYYY/MM/DD.
 */
export class CodexSessionWatcher implements SessionTranscriptWatcher {
    private sessionsRoot = path.join(os.homedir(), '.codex', 'sessions');
    private cwd: string;
    private sessionFile: string | null = null;
    private sessionId: string | null = null;
    private fileOffset = 0;
    private startTimeMs: number;
    private onEvent: (events: SessionPayload[]) => void;
    private destroyed = false;
    private pollTimeout: ReturnType<typeof setTimeout> | null = null;
    private syntheticCallIndex = 0;
    private seenLineHashes = new Set<string>();

    constructor(cwd: string, onEvent: (events: SessionPayload[]) => void) {
        this.cwd = path.resolve(cwd);
        this.onEvent = onEvent;
        this.startTimeMs = Date.now();
    }

    start(): void {
        this.schedulePoll(1500);
    }

    destroy(): void {
        this.destroyed = true;
        if (this.pollTimeout) {
            clearTimeout(this.pollTimeout);
            this.pollTimeout = null;
        }
    }

    private schedulePoll(delayMs = 700): void {
        if (this.destroyed) return;
        this.pollTimeout = setTimeout(() => {
            if (this.destroyed) return;
            if (!this.sessionFile) {
                this.findSessionFile();
            } else {
                this.readNewLines();
            }
            this.schedulePoll();
        }, delayMs);
    }

    private getCandidateDateDirs(): string[] {
        const dateOffsets = [-1, 0, 1];
        const dirs = new Set<string>();

        for (const offset of dateOffsets) {
            const date = new Date(this.startTimeMs + offset * 24 * 60 * 60 * 1000);
            const yyyy = date.getFullYear().toString();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            dirs.add(path.join(this.sessionsRoot, yyyy, mm, dd));
        }

        return Array.from(dirs);
    }

    private listCandidates(): FileCandidate[] {
        const files: FileCandidate[] = [];

        for (const dir of this.getCandidateDateDirs()) {
            if (!fs.existsSync(dir)) continue;

            let names: string[] = [];
            try {
                names = fs.readdirSync(dir);
            } catch {
                continue;
            }

            for (const name of names) {
                if (!name.startsWith('rollout-') || !name.endsWith('.jsonl')) continue;
                const filePath = path.join(dir, name);
                try {
                    const stat = fs.statSync(filePath);
                    files.push({ filePath, mtimeMs: stat.mtimeMs });
                } catch {
                    // ignore unreadable file
                }
            }
        }

        return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    }

    private readSessionMeta(filePath: string): CodexSessionMeta | null {
        try {
            const fd = fs.openSync(filePath, 'r');
            const headBuf = Buffer.alloc(64 * 1024);
            const bytesRead = fs.readSync(fd, headBuf, 0, headBuf.length, 0);
            fs.closeSync(fd);

            const head = headBuf.toString('utf-8', 0, bytesRead);
            const lines = head.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                const parsed = safeJsonParse<Record<string, unknown>>(trimmed);
                if (!parsed) continue;
                if (parsed.type !== 'session_meta') continue;

                const payload = parsed.payload as Record<string, unknown> | undefined;
                const metaCwd = payload && typeof payload.cwd === 'string' ? path.resolve(payload.cwd) : '';
                if (!metaCwd) return null;

                const sessionId = payload && typeof payload.id === 'string' ? payload.id : undefined;
                const startTimeMs = parseIsoMs(payload?.timestamp) || parseIsoMs(parsed.timestamp);

                return { cwd: metaCwd, sessionId, startTimeMs };
            }
        } catch {
            return null;
        }

        return null;
    }

    private findSessionFile(): void {
        const candidates = this.listCandidates();

        for (const candidate of candidates) {
            const meta = this.readSessionMeta(candidate.filePath);
            if (!meta) continue;
            if (meta.cwd !== this.cwd) continue;

            const isFreshByMetaTime = meta.startTimeMs >= this.startTimeMs - 5 * 60 * 1000;
            const isFreshByFileTime = candidate.mtimeMs >= this.startTimeMs - 5 * 60 * 1000;
            if (isFreshByMetaTime || isFreshByFileTime) {
                this.sessionFile = candidate.filePath;
                this.sessionId = meta.sessionId || null;
                try {
                    this.fileOffset = fs.statSync(candidate.filePath).size;
                } catch {
                    this.fileOffset = 0;
                }
                return;
            }
        }
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
                if (!trimmed) continue;

                // 중복 방지: 동일한 라인은 한 번만 처리 (Codex가 파일을 rewrite할 때 방지)
                const lineHash = crypto.createHash('sha1').update(trimmed).digest('hex');
                if (this.seenLineHashes.has(lineHash)) continue;
                this.seenLineHashes.add(lineHash);

                const events = this.processLine(trimmed);
                if (events.length > 0) this.onEvent(events);
            }
        } catch {
            // ignore read errors
        }
    }

    private nextSyntheticCallId(prefix: string): string {
        this.syntheticCallIndex += 1;
        const base = this.sessionId || 'codex';
        return `${prefix}-${base}-${this.syntheticCallIndex}`;
    }

    private decodeToolOutput(rawOutput: unknown): { result: string; error?: string } {
        if (typeof rawOutput === 'string') {
            const parsed = safeJsonParse<Record<string, unknown>>(rawOutput);
            if (parsed) {
                const result = ensureText(parsed.output ?? parsed.result ?? parsed.message);
                const error = ensureText(parsed.error);
                return {
                    result: result || rawOutput,
                    ...(error ? { error } : {}),
                };
            }

            return { result: rawOutput };
        }

        if (rawOutput && typeof rawOutput === 'object') {
            const parsed = rawOutput as Record<string, unknown>;
            const result = ensureText(parsed.output ?? parsed.result ?? parsed.message) || JSON.stringify(parsed);
            const error = ensureText(parsed.error);
            return {
                result,
                ...(error ? { error } : {}),
            };
        }

        return { result: '' };
    }

    private processLine(line: string): SessionPayload[] {
        const parsed = safeJsonParse<Record<string, unknown>>(line);
        if (!parsed) return [];
        if (parsed.type !== 'response_item') return [];

        const payload = parsed.payload as Record<string, unknown> | undefined;
        if (!payload || typeof payload !== 'object') return [];

        const payloadType = typeof payload.type === 'string' ? payload.type : '';
        const events: SessionPayload[] = [];

        if (payloadType === 'message' && payload.role === 'assistant') {
            const content = Array.isArray(payload.content) ? payload.content : [];
            for (const item of content) {
                if (!item || typeof item !== 'object') continue;
                const block = item as Record<string, unknown>;
                const blockType = typeof block.type === 'string' ? block.type : '';
                if ((blockType === 'output_text' || blockType === 'text') && typeof block.text === 'string' && block.text.trim()) {
                    events.push({ t: 'text', text: block.text });
                }
            }
            return events;
        }

        if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
            const callId = typeof payload.call_id === 'string'
                ? payload.call_id
                : this.nextSyntheticCallId('tool-call');
            const name = typeof payload.name === 'string' ? payload.name : 'tool';
            const argumentsRaw = payloadType === 'function_call'
                ? payload.arguments
                : payload.input;
            const argumentsText = typeof argumentsRaw === 'string'
                ? argumentsRaw
                : (argumentsRaw ? JSON.stringify(argumentsRaw) : '');

            events.push({
                t: 'tool-call',
                id: callId,
                name,
                arguments: argumentsText,
            });
            return events;
        }

        if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
            const callId = typeof payload.call_id === 'string'
                ? payload.call_id
                : this.nextSyntheticCallId('tool-result');
            const decoded = this.decodeToolOutput(payload.output);
            events.push({
                t: 'tool-result',
                id: callId,
                result: decoded.result,
                ...(decoded.error ? { error: decoded.error } : {}),
            });
            return events;
        }

        return [];
    }
}

/**
 * Watches Gemini CLI chat transcript in ~/.gemini/tmp/<projectHash>/chats/session-*.json.
 */
export class GeminiSessionWatcher implements SessionTranscriptWatcher {
    private cwd: string;
    private chatsDirs: string[];
    private startTimeMs: number;
    private onEvent: (events: SessionPayload[]) => void;
    private sessionFile: string | null = null;
    private seenMessageIds = new Set<string>();
    private destroyed = false;
    private pollTimeout: ReturnType<typeof setTimeout> | null = null;
    private lastMtimeMs = 0;

    constructor(cwd: string, onEvent: (events: SessionPayload[]) => void) {
        this.cwd = path.resolve(cwd);
        this.startTimeMs = Date.now();
        this.onEvent = onEvent;
        this.chatsDirs = this.resolveCandidateChatsDirs();
    }

    start(): void {
        this.schedulePoll(1500);
    }

    destroy(): void {
        this.destroyed = true;
        if (this.pollTimeout) {
            clearTimeout(this.pollTimeout);
            this.pollTimeout = null;
        }
    }

    private schedulePoll(delayMs = 700): void {
        if (this.destroyed) return;
        this.pollTimeout = setTimeout(() => {
            if (this.destroyed) return;
            if (!this.sessionFile) {
                this.findSessionFile();
            } else {
                this.readSessionUpdates();
            }
            this.schedulePoll();
        }, delayMs);
    }

    private resolveCandidateChatsDirs(): string[] {
        const tmpRoot = path.join(os.homedir(), '.gemini', 'tmp');
        const dirs = new Set<string>();

        // Legacy layout: ~/.gemini/tmp/<sha256(cwd)>/chats
        dirs.add(path.join(tmpRoot, hashPath(this.cwd), 'chats'));

        // Newer layouts can be mapped via ~/.gemini/projects.json
        const projectsFile = path.join(os.homedir(), '.gemini', 'projects.json');
        try {
            const raw = safeJsonParse<Record<string, unknown>>(fs.readFileSync(projectsFile, 'utf-8'));
            const projects = raw && typeof raw.projects === 'object'
                ? raw.projects as Record<string, unknown>
                : null;

            if (projects) {
                const keys = Object.keys(projects).sort((a, b) => b.length - a.length);
                const matchedProject = keys.find((projectPath) => {
                    const normalized = path.resolve(projectPath);
                    return this.cwd === normalized || this.cwd.startsWith(`${normalized}${path.sep}`);
                });

                if (matchedProject) {
                    const alias = projects[matchedProject];
                    if (typeof alias === 'string' && alias.trim()) {
                        dirs.add(path.join(tmpRoot, alias.trim(), 'chats'));
                    }
                }
            }
        } catch {
            // ignore projects mapping read errors
        }

        // Common default layout: ~/.gemini/tmp/<username>/chats
        try {
            dirs.add(path.join(tmpRoot, os.userInfo().username, 'chats'));
        } catch {
            // ignore user info errors
        }

        // Last resort: scan first-level tmp directories
        try {
            if (fs.existsSync(tmpRoot)) {
                for (const name of fs.readdirSync(tmpRoot)) {
                    dirs.add(path.join(tmpRoot, name, 'chats'));
                }
            }
        } catch {
            // ignore
        }

        return Array.from(dirs);
    }

    private listSessionCandidates(): string[] {
        const result: string[] = [];
        for (const chatsDir of this.chatsDirs) {
            if (!fs.existsSync(chatsDir)) continue;
            let names: string[] = [];
            try {
                names = fs.readdirSync(chatsDir);
            } catch {
                continue;
            }

            for (const name of names) {
                if (!name.startsWith('session-') || !name.endsWith('.json')) continue;
                result.push(path.join(chatsDir, name));
            }
        }
        return result;
    }

    private findSessionFile(): void {
        const fileCandidates = this.listSessionCandidates();
        if (fileCandidates.length === 0) return;

        type Candidate = {
            filePath: string;
            startTimeMs: number;
            lastUpdatedMs: number;
            messages: Record<string, unknown>[];
            messageIds: string[];
        };

        const candidates: Candidate[] = [];

        for (const filePath of fileCandidates) {
            const raw = safeJsonParse<Record<string, unknown>>(fs.readFileSync(filePath, 'utf-8'));
            if (!raw) continue;

            const startTimeMs = parseIsoMs(raw.startTime);
            const lastUpdatedMs = parseIsoMs(raw.lastUpdated);
            const messages = Array.isArray(raw.messages) ? raw.messages : [];
            const normalizedMessages = messages
                .filter((msg): msg is Record<string, unknown> => Boolean(msg && typeof msg === 'object'));
            const messageIds = messages
                .map((msg) => {
                    if (!msg || typeof msg !== 'object') return '';
                    const entry = msg as Record<string, unknown>;
                    return typeof entry.id === 'string' ? entry.id : '';
                })
                .filter(Boolean);

            candidates.push({ filePath, startTimeMs, lastUpdatedMs, messages: normalizedMessages, messageIds });
        }

        if (candidates.length === 0) return;

        const sorted = candidates.sort((a, b) => b.lastUpdatedMs - a.lastUpdatedMs);
        const active = sorted.find((candidate) =>
            candidate.startTimeMs >= this.startTimeMs - 5 * 60 * 1000
            || candidate.lastUpdatedMs >= this.startTimeMs - 5 * 60 * 1000,
        );
        if (!active) return;

        this.sessionFile = active.filePath;
        this.seenMessageIds = new Set(active.messageIds);
        const initialEvents: SessionPayload[] = [];
        for (let i = 0; i < active.messages.length; i += 1) {
            const message = active.messages[i];
            const fallbackId = `gemini-msg-${i}`;
            initialEvents.push(...this.parseGeminiMessage(message, fallbackId));
        }

        try {
            this.lastMtimeMs = fs.statSync(active.filePath).mtimeMs;
        } catch {
            this.lastMtimeMs = 0;
        }

        if (initialEvents.length > 0) {
            this.onEvent(initialEvents);
        }
    }

    private parseGeminiMessage(message: Record<string, unknown>, fallbackId: string): SessionPayload[] {
        const type = typeof message.type === 'string' ? message.type.toLowerCase() : '';
        const id = typeof message.id === 'string' ? message.id : fallbackId;
        const events: SessionPayload[] = [];

        if (type === 'gemini') {
            const text = ensureText(message.content);
            if (text.trim()) {
                events.push({ t: 'text', text });
            }
            return events;
        }

        if (type === 'error') {
            const text = ensureText(message.content);
            if (text.trim()) {
                events.push({ t: 'text', text: `[Gemini Error] ${text}` });
            }
            return events;
        }

        if (type === 'tool-call' || type === 'tool_call' || type === 'tool-use' || type === 'tool_use') {
            const name = ensureText(message.name ?? message.toolName ?? message.tool) || 'tool';
            const argsRaw = message.arguments ?? message.input ?? message.params;
            const argumentsText = typeof argsRaw === 'string' ? argsRaw : (argsRaw ? JSON.stringify(argsRaw) : '');
            events.push({
                t: 'tool-call',
                id,
                name,
                arguments: argumentsText,
            });
            return events;
        }

        if (type === 'tool-result' || type === 'tool_result' || type === 'tool-response' || type === 'tool_response') {
            const result = ensureText(message.result ?? message.output ?? message.content);
            const error = ensureText(message.error);
            events.push({
                t: 'tool-result',
                id,
                result,
                ...(error ? { error } : {}),
            });
            return events;
        }

        return events;
    }

    private readSessionUpdates(): void {
        if (!this.sessionFile) return;

        try {
            const stat = fs.statSync(this.sessionFile);
            if (stat.mtimeMs <= this.lastMtimeMs) return;
            this.lastMtimeMs = stat.mtimeMs;

            const raw = safeJsonParse<Record<string, unknown>>(fs.readFileSync(this.sessionFile, 'utf-8'));
            if (!raw) return;

            const messages = Array.isArray(raw.messages) ? raw.messages : [];
            const events: SessionPayload[] = [];

            for (let i = 0; i < messages.length; i += 1) {
                const msg = messages[i];
                if (!msg || typeof msg !== 'object') continue;

                const message = msg as Record<string, unknown>;
                const fallbackId = `gemini-msg-${i}`;
                const messageId = typeof message.id === 'string' ? message.id : fallbackId;

                if (this.seenMessageIds.has(messageId)) continue;
                this.seenMessageIds.add(messageId);

                const parsedEvents = this.parseGeminiMessage(message, messageId);
                if (parsedEvents.length > 0) events.push(...parsedEvents);
            }

            if (events.length > 0) this.onEvent(events);
        } catch {
            // ignore temporary file parse/read errors
        }
    }
}

export function createSessionTranscriptWatcher(
    engine: string,
    cwd: string,
    onEvent: (events: SessionPayload[]) => void,
): SessionTranscriptWatcher | null {
    const normalizedEngine = engine.trim().toLowerCase();

    if (normalizedEngine === 'claude') {
        return new ClaudeSessionWatcher(cwd, onEvent);
    }

    if (normalizedEngine === 'codex') {
        return new CodexSessionWatcher(cwd, onEvent);
    }

    if (normalizedEngine === 'gemini') {
        return new GeminiSessionWatcher(cwd, onEvent);
    }

    return null;
}

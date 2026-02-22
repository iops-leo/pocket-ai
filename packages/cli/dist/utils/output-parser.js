import crypto from 'crypto';
/**
 * Comprehensive ANSI/VT escape sequence stripper.
 * Handles: CSI (color/cursor), OSC (title), 2-char ESC sequences, C1 controls.
 */
const stripAnsi = (str) => str
    // OSC sequences: ESC ] ... BEL or ESC \
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // CSI sequences: ESC [ params final (includes private ?/! modes)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    // 2-char ESC sequences — exclude '[' (0x5B) to avoid consuming CSI introducer
    .replace(/\x1b[\x20-\x5a\x5c-\x7e]/g, '')
    // C1 control codes (8-bit equivalents of ESC + Fe)
    .replace(/[\x80-\x9f]/g, '')
    // Remaining stray ESC
    .replace(/\x1b/g, '')
    // Orphaned CSI fragments left after partial ESC strip (e.g. [38;5;246m, [?2026h)
    .replace(/\[[\d;?]+[A-Za-z]/g, '');
/**
 * Detect lines that are terminal chrome, not meaningful chat content.
 */
const isTuiChrome = (line) => {
    const trimmed = line.trimStart();
    if (!trimmed)
        return true;
    const firstChar = trimmed[0];
    // Box-drawing border lines (startup screen, tool output borders)
    if ('╭╮╰╯━═│'.includes(firstChar))
        return true;
    // Lines consisting entirely of ─ (common separator)
    if (/^─+$/.test(trimmed))
        return true;
    // OMC/HUD status bar: [TAG] | ... pattern (e.g. "[OMC] | 5h:72%...")
    if (/^\[[\w-]+\]\s*[|│]/.test(trimmed))
        return true;
    // Shell prompt: ❯, %, $
    if (firstChar === '❯' || firstChar === '%' || firstChar === '$')
        return true;
    // Lines with high density of UI/block chars (borders, spinners, etc.)
    const uiChars = (line.match(/[╭╮╰╯│─━═╔╗╚╝║▀▄█▌▐░▒▓▟▙▖▗▘▝▞▚]/g) ?? []).length;
    return uiChars >= 3 && uiChars / line.length > 0.2;
};
// Claude Code tool call pattern: ⏺ ToolName(args...)
const TOOL_PATTERN = /^[⏺●▶◆✦]\s+(\w[\w.]*)\((.*)/;
export class ClaudeOutputParser {
    lineBuffer = '';
    currentToolId = null;
    toolOutputLines = [];
    /** Last streamed (non-\n) text emitted — for delta deduplication */
    lastStreamText = '';
    feed(rawChunk) {
        const events = [];
        const data = this.lineBuffer + rawChunk;
        const parts = data.split('\n');
        this.lineBuffer = parts.pop() ?? '';
        for (const part of parts) {
            // 1. Strip ALL trailing \r — PTY sends \r\r\n (app writes \r\n, PTY OPOST adds \r)
            //    THEN handle inline \r updates (progress indicators: "50%\r100%")
            const cleanPart = part.replace(/\r+$/, '');
            const segments = cleanPart.split('\r');
            const finalSegment = segments[segments.length - 1];
            const clean = stripAnsi(finalSegment).trimEnd();
            if (!clean.trim())
                continue;
            // \n-terminated content resets the streaming cursor
            this.lastStreamText = '';
            const toolMatch = clean.trimStart().match(TOOL_PATTERN);
            if (toolMatch) {
                // Flush previous tool result
                if (this.currentToolId) {
                    events.push({
                        t: 'tool-result',
                        id: this.currentToolId,
                        result: this.toolOutputLines.join('\n').trim(),
                    });
                    this.toolOutputLines = [];
                }
                const id = crypto.randomUUID();
                this.currentToolId = id;
                const name = toolMatch[1];
                const args = toolMatch[2].replace(/\)$/, '').trim();
                events.push({ t: 'tool-call', id, name, arguments: args });
            }
            else if (this.currentToolId) {
                // Collect tool output (indented or box-bordered lines)
                const isIndented = clean.startsWith('  ') || clean.startsWith('\t');
                if (isIndented || clean.startsWith('│') || clean.startsWith('|')) {
                    this.toolOutputLines.push(clean.trim());
                }
                else {
                    // Non-indented line ends the tool output block
                    events.push({
                        t: 'tool-result',
                        id: this.currentToolId,
                        result: this.toolOutputLines.join('\n').trim(),
                    });
                    this.currentToolId = null;
                    this.toolOutputLines = [];
                    if (!isTuiChrome(clean)) {
                        events.push({ t: 'text', text: clean + '\n' });
                    }
                }
            }
            else {
                // Regular text — skip TUI chrome (startup screen, borders, status bars)
                if (!isTuiChrome(clean)) {
                    events.push({ t: 'text', text: clean + '\n' });
                }
            }
        }
        // ── Streaming flush ──────────────────────────────────────────────────────
        // Claude Code is a full-screen TUI: it renders with cursor addressing, not \n.
        // We peek at lineBuffer on every chunk to capture streaming content in real-time.
        if (this.lineBuffer && !this.currentToolId) {
            const streamEvents = this.peekStreamBuffer();
            events.push(...streamEvents);
        }
        return events;
    }
    /**
     * Peek at the current lineBuffer content and emit any new streaming text.
     * Does NOT clear lineBuffer (it will be cleared when \n eventually arrives).
     * Uses delta encoding so duplicate content is never sent.
     */
    peekStreamBuffer() {
        // Take the last \r-separated segment = the latest visible text
        const rawSeg = this.lineBuffer.split('\r').pop() ?? '';
        const clean = stripAnsi(rawSeg).trimEnd();
        if (!clean.trim() || isTuiChrome(clean))
            return [];
        if (clean.trimStart().match(TOOL_PATTERN))
            return []; // handled on \n cycle
        // Delta: only emit chars added since last peek
        if (clean.startsWith(this.lastStreamText)) {
            const delta = clean.slice(this.lastStreamText.length);
            if (!delta.trim())
                return [];
            this.lastStreamText = clean;
            return [{ t: 'text', text: delta }];
        }
        // New streaming line (content changed completely)
        const prefix = this.lastStreamText ? '\n' : '';
        this.lastStreamText = clean;
        return [{ t: 'text', text: prefix + clean }];
    }
    flush() {
        const events = [];
        // Emit any buffered streaming text
        if (this.lineBuffer) {
            events.push(...this.peekStreamBuffer());
            this.lineBuffer = '';
        }
        if (this.currentToolId) {
            const event = {
                t: 'tool-result',
                id: this.currentToolId,
                result: this.toolOutputLines.join('\n').trim(),
            };
            this.currentToolId = null;
            this.toolOutputLines = [];
            events.push(event);
        }
        return events;
    }
}

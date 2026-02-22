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
    // 2-char ESC sequences (save/restore cursor, charset, scroll, etc.)
    // NOTE: exclude '[' (0x5B) to avoid consuming CSI introducer \x1b[
    .replace(/\x1b[\x20-\x5a\x5c-\x7e]/g, '')
    // C1 control codes (8-bit equivalents of ESC + Fe)
    .replace(/[\x80-\x9f]/g, '')
    // Remaining stray ESC
    .replace(/\x1b/g, '')
    // Orphaned CSI fragments: if \x1b was stripped alone, [38;5;246m etc. remain
    .replace(/\[[\d;?]+[A-Za-z]/g, '');
/**
 * Detect lines that are terminal chrome, not meaningful chat content:
 * - Claude Code TUI startup screen (box borders, block chars)
 * - OMC/HUD status bar: [OMC] | 5h:11%...
 * - Shell prompt lines: ❯, %
 * - Pure separator lines: ─────, ━━━━━
 */
const isTuiChrome = (line) => {
    const trimmed = line.trimStart();
    if (!trimmed)
        return true;
    const firstChar = trimmed[0];
    // Box-drawing border lines (startup screen)
    if ('╭╮╰╯━═'.includes(firstChar))
        return true;
    // Lines consisting entirely of ─ (common separator)
    if (/^─+$/.test(trimmed))
        return true;
    // OMC/HUD status bar: [TAG] | ... pattern
    if (/^\[[\w-]+\]/.test(trimmed))
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
    feed(rawChunk) {
        const events = [];
        const data = this.lineBuffer + rawChunk;
        const parts = data.split('\n');
        this.lineBuffer = parts.pop() ?? '';
        for (const part of parts) {
            // 1. Strip trailing \r from \r\n line endings (PTY always sends \r\n)
            //    THEN handle inline \r updates (progress indicators: "50%\r100%")
            const cleanPart = part.replace(/\r$/, '');
            const segments = cleanPart.split('\r');
            const finalSegment = segments[segments.length - 1];
            const clean = stripAnsi(finalSegment).trimEnd();
            if (!clean.trim())
                continue;
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
        return events;
    }
    flush() {
        if (this.currentToolId) {
            const event = {
                t: 'tool-result',
                id: this.currentToolId,
                result: this.toolOutputLines.join('\n').trim(),
            };
            this.currentToolId = null;
            this.toolOutputLines = [];
            return [event];
        }
        return [];
    }
}

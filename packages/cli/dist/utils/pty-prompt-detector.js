function stripAnsi(input) {
    return input.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}
const CODEX_PATTERNS = [
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
const GEMINI_PATTERNS = [
    // Gemini numbered permission menu (MCP tools, shell, file write 등)
    {
        detect: /1\.\s*Allow once/,
        extract: (buf) => {
            // MCP 도구 권한
            const mcpMatch = buf.match(/MCP tool "(.+?)"/);
            const serverMatch = buf.match(/from server "(.+?)"/);
            if (mcpMatch) {
                return {
                    toolName: mcpMatch[1],
                    message: `MCP: ${mcpMatch[1]} (${serverMatch?.[1] || 'unknown'})`,
                };
            }
            // 일반 권한 (파일, 셸 등)
            const allowMatch = buf.match(/(?:Allow|Confirm) (.+?)\?/i);
            return {
                toolName: 'Permission',
                message: allowMatch?.[0] || 'Gemini requests permission',
            };
        },
        approveKey: '\r', // Enter (option 1 기본 선택)
        denyKey: '\x1B', // Esc
    },
    // Legacy y/n 스타일
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
    buffer = '';
    engine;
    patterns;
    pendingRequestId = null;
    pendingPattern = null;
    onPromptDetected;
    requestCounter = 0;
    constructor(engine, onPromptDetected) {
        this.engine = engine;
        this.patterns = engine === 'codex' ? CODEX_PATTERNS : GEMINI_PATTERNS;
        this.onPromptDetected = onPromptDetected;
    }
    feed(data) {
        const clean = stripAnsi(data);
        this.buffer += clean;
        if (this.buffer.length > MAX_BUFFER) {
            this.buffer = this.buffer.slice(-MAX_BUFFER);
        }
        // Skip detection while a prompt is already pending
        if (this.pendingRequestId)
            return;
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
    respond(requestId, approved) {
        if (this.pendingRequestId !== requestId || !this.pendingPattern) {
            return null;
        }
        const key = approved ? this.pendingPattern.approveKey : this.pendingPattern.denyKey;
        this.pendingRequestId = null;
        this.pendingPattern = null;
        return key;
    }
}

import crypto from 'crypto';
import type { SessionPayload } from '@pocket-ai/wire';

const stripAnsi = (str: string) =>
    str.replace(/[\x1b\x9b](?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');

// Claude Code tool call pattern: ⏺ ToolName(args...)
const TOOL_PATTERN = /^[⏺●▶◆✦]\s+(\w[\w.]*)\((.*)/;

export class ClaudeOutputParser {
    private lineBuffer = '';
    private currentToolId: string | null = null;
    private toolOutputLines: string[] = [];

    feed(rawChunk: string): SessionPayload[] {
        const events: SessionPayload[] = [];
        const data = this.lineBuffer + rawChunk;
        const parts = data.split('\n');
        this.lineBuffer = parts.pop() ?? '';

        for (const part of parts) {
            // \r 처리: 인플레이스 업데이트는 마지막 segment만 사용
            const segments = part.split('\r');
            const finalSegment = segments[segments.length - 1];
            const clean = stripAnsi(finalSegment).trimEnd();

            if (!clean.trim()) continue;

            const toolMatch = clean.trimStart().match(TOOL_PATTERN);

            if (toolMatch) {
                // 이전 툴 결과 flush
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

            } else if (this.currentToolId) {
                // 들여쓰기 없는 라인 → tool output 종료, 텍스트로 전환
                const isIndented = clean.startsWith('  ') || clean.startsWith('\t');
                if (isIndented || clean.startsWith('│') || clean.startsWith('|')) {
                    this.toolOutputLines.push(clean.trim());
                } else {
                    // flush tool result
                    events.push({
                        t: 'tool-result',
                        id: this.currentToolId,
                        result: this.toolOutputLines.join('\n').trim(),
                    });
                    this.currentToolId = null;
                    this.toolOutputLines = [];
                    // 현재 라인은 텍스트
                    events.push({ t: 'text', text: clean + '\n' });
                }
            } else {
                events.push({ t: 'text', text: clean + '\n' });
            }
        }

        return events;
    }

    flush(): SessionPayload[] {
        if (this.currentToolId) {
            const event: SessionPayload = {
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

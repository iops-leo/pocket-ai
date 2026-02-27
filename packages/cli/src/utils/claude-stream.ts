import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import type { SessionPayload, SessionMessageInputRequest } from '@pocket-ai/wire';

/**
 * Claude Code JSON 스트리밍 브릿지
 *
 * Claude Code CLI를 --output-format stream-json --input-format stream-json
 * --permission-prompt-tool stdio 모드로 실행하여 구조화된 JSON 양방향 통신을 수행한다.
 *
 * Happy 프로젝트의 query.ts 패턴 참고:
 * https://github.com/slopus/happy/blob/main/packages/happy-cli/src/claude/sdk/query.ts
 */

export type PermissionMode = 'default' | 'acceptEdits' | 'planMode' | 'yolo';

export interface ClaudeStreamOptions {
    cwd: string;
    sessionId?: string;
    headless?: boolean;
    onMessage: (event: SessionPayload) => void;
    onPermissionRequest: (request: SessionMessageInputRequest) => void;
    onReady: () => void;
    onSessionId?: (claudeSessionId: string) => void;
    onExit: (code: number) => void;
}

interface PendingPermission {
    resolve: (result: { behavior: 'allow' | 'deny'; updatedInput?: Record<string, unknown>; message?: string }) => void;
    inputRequest: SessionMessageInputRequest;
}

export class ClaudeStreamBridge {
    private child: ChildProcess | null = null;
    private pendingPermissions = new Map<string, PendingPermission>();
    private options: ClaudeStreamOptions;
    private destroyed = false;
    private claudeSessionId: string | null = null;
    private waitingForInput = false;
    private permissionMode: PermissionMode = 'default';

    setPermissionMode(mode: PermissionMode): void {
        this.permissionMode = mode;
    }

    getPermissionMode(): PermissionMode {
        return this.permissionMode;
    }

    constructor(options: ClaudeStreamOptions) {
        this.options = options;
    }

    /**
     * Claude 프로세스를 JSON 스트리밍 모드로 스폰한다.
     */
    start(): void {
        const args = [
            '--output-format', 'stream-json',
            '--input-format', 'stream-json',
            '--permission-prompt-tool', 'stdio',
            '--verbose',
        ];

        if (this.options.sessionId) {
            args.push('--resume', this.options.sessionId);
        }

        this.child = spawn('claude', args, {
            cwd: this.options.cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env },
        });

        if (!this.child.stdout || !this.child.stdin) {
            console.error('[ClaudeStream] stdin/stdout 파이프 생성 실패');
            this.options.onExit(1);
            return;
        }

        // stderr → 로컬 콘솔 (디버그용)
        this.child.stderr?.on('data', (data: Buffer) => {
            if (!this.options.headless) {
                process.stderr.write(data);
            }
        });

        // stdout → JSON 라인 파싱
        const rl = createInterface({ input: this.child.stdout });

        rl.on('line', (line: string) => {
            if (!line.trim()) return;

            let message: Record<string, unknown>;
            try {
                message = JSON.parse(line);
            } catch {
                // JSON이 아닌 라인은 무시 (ANSI 디버그 출력 등)
                return;
            }

            this.handleMessage(message);
        });

        this.child.on('exit', (code) => {
            if (!this.destroyed) {
                this.options.onExit(code ?? 0);
            }
        });

        this.child.on('error', (err) => {
            console.error('[ClaudeStream] 프로세스 오류:', err.message);
            if (!this.destroyed) {
                this.options.onExit(1);
            }
        });
    }

    /**
     * PWA 또는 로컬 stdin에서 온 사용자 메시지를 Claude에 전달한다.
     */
    sendMessage(text: string): void {
        if (!this.child?.stdin || this.destroyed) return;

        const msg = {
            type: 'user',
            message: {
                role: 'user',
                content: text,
            },
        };

        this.writeJson(msg);
        this.waitingForInput = false;
    }

    /**
     * PWA에서 온 권한 응답을 Claude에 전달한다.
     */
    respondToPermission(requestId: string, approved: boolean, message?: string): void {
        const pending = this.pendingPermissions.get(requestId);
        if (!pending) {
            console.warn(`[ClaudeStream] 알 수 없는 권한 요청 ID: ${requestId}`);
            return;
        }

        if (approved) {
            pending.resolve({ behavior: 'allow' });
        } else {
            pending.resolve({ behavior: 'deny', message: message || 'User denied the tool call' });
        }

        this.pendingPermissions.delete(requestId);
    }

    /**
     * Claude에 인터럽트를 보낸다.
     */
    interrupt(): void {
        if (!this.child?.stdin || this.destroyed) return;

        const requestId = `interrupt-${Date.now()}`;
        this.writeJson({
            type: 'control_request',
            request_id: requestId,
            request: { subtype: 'interrupt' },
        });
    }

    /**
     * Claude 프로세스를 종료한다.
     */
    kill(): void {
        this.destroyed = true;

        // 모든 pending 권한 요청 거부
        for (const [id, pending] of this.pendingPermissions) {
            pending.resolve({ behavior: 'deny', message: 'Session terminated' });
            this.pendingPermissions.delete(id);
        }

        if (this.child) {
            this.child.kill('SIGTERM');
            this.child = null;
        }
    }

    get isWaitingForInput(): boolean {
        return this.waitingForInput;
    }

    get sessionId(): string | null {
        return this.claudeSessionId;
    }

    /** 현재 응답 대기 중인 permission 요청 목록 반환 (PWA 재연결 시 재전송용) */
    getPendingInputRequests(): SessionMessageInputRequest[] {
        return Array.from(this.pendingPermissions.values()).map(p => p.inputRequest);
    }

    // ─── 내부 메서드 ───

    private handleMessage(message: Record<string, unknown>): void {
        const type = message.type as string;

        // control_request: Claude가 도구 사용 권한을 요청
        if (type === 'control_request') {
            this.handleControlRequest(message);
            return;
        }

        // control_cancel_request: Claude가 pending 권한 요청을 취소
        if (type === 'control_cancel_request') {
            const requestId = message.request_id as string;
            const pending = this.pendingPermissions.get(requestId);
            if (pending) {
                pending.resolve({ behavior: 'deny', message: 'Cancelled by Claude' });
                this.pendingPermissions.delete(requestId);
            }
            return;
        }

        // control_response: Claude가 interrupt에 대한 응답
        if (type === 'control_response') {
            return; // 무시
        }

        // system init: 세션 ID 수신
        if (type === 'system') {
            const subtype = message.subtype as string;
            if (subtype === 'init' && message.session_id) {
                this.claudeSessionId = message.session_id as string;
                this.options.onSessionId?.(this.claudeSessionId);
                if (!this.options.headless) {
                    console.log(`[ClaudeStream] 세션 시작: ${this.claudeSessionId.slice(0, 8)}...`);
                }
            }
            return;
        }

        // result: Claude의 턴이 완료됨 (다음 입력 대기)
        if (type === 'result') {
            this.waitingForInput = true;
            this.options.onReady();

            if (!this.options.headless) {
                const subtype = message.subtype as string;
                if (subtype === 'success') {
                    console.log('\n[ClaudeStream] 응답 완료. 입력 대기 중...');
                } else {
                    console.log(`\n[ClaudeStream] 응답 완료 (${subtype}). 입력 대기 중...`);
                }
            }
            return;
        }

        // assistant: Claude의 텍스트/도구 호출 출력
        if (type === 'assistant') {
            this.handleAssistantMessage(message);
            return;
        }

        // user: 도구 결과 (tool_result)
        if (type === 'user') {
            this.handleUserMessage(message);
            return;
        }
    }

    private handleAssistantMessage(message: Record<string, unknown>): void {
        const msg = message.message as Record<string, unknown> | undefined;
        if (!msg) return;

        const content = msg.content as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(content)) return;

        for (const block of content) {
            const blockType = block.type as string;

            if (blockType === 'text' && typeof block.text === 'string' && block.text.trim()) {
                this.options.onMessage({ t: 'text', text: block.text });

                if (!this.options.headless) {
                    process.stdout.write(block.text);
                }
            }

            if (blockType === 'tool_use') {
                const args = block.input != null ? JSON.stringify(block.input) : '';
                this.options.onMessage({
                    t: 'tool-call',
                    id: block.id as string,
                    name: block.name as string,
                    arguments: args,
                });

                if (!this.options.headless) {
                    console.log(`\n⏺ ${block.name as string}`);
                }
            }
        }
    }

    private handleUserMessage(message: Record<string, unknown>): void {
        const msg = message.message as Record<string, unknown> | undefined;
        if (!msg) return;

        const content = msg.content as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(content)) return;

        for (const block of content) {
            if (block.type === 'tool_result') {
                const resultContent = block.content;
                let result: string;

                if (typeof resultContent === 'string') {
                    result = resultContent;
                } else if (Array.isArray(resultContent)) {
                    result = resultContent
                        .map((c: Record<string, unknown>) => typeof c.text === 'string' ? c.text : '')
                        .join('\n');
                } else {
                    result = '';
                }

                this.options.onMessage({
                    t: 'tool-result',
                    id: block.tool_use_id as string,
                    result,
                    ...(block.is_error ? { error: result } : {}),
                });

                if (!this.options.headless) {
                    const summary = result.length > 200 ? result.slice(0, 200) + '...' : result;
                    console.log(`  → ${summary}`);
                }
            }
        }
    }

    private async handleControlRequest(message: Record<string, unknown>): Promise<void> {
        const requestId = message.request_id as string;
        const request = message.request as Record<string, unknown>;

        if (!request || request.subtype !== 'can_use_tool') return;

        const toolName = request.tool_name as string;
        const toolInput = request.input as Record<string, unknown>;

        // ─── 퍼미션 모드에 따른 자동 처리 ───
        if (this.permissionMode === 'yolo') {
            if (!this.options.headless) console.log(`\n[Yolo] 자동 허용: ${toolName}`);
            this.writeJson({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: { behavior: 'allow', updatedInput: toolInput } } });
            return;
        }
        if (this.permissionMode === 'planMode') {
            if (!this.options.headless) console.log(`\n[Plan Mode] 자동 거부: ${toolName}`);
            this.writeJson({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: { behavior: 'deny', message: 'Plan mode: 실행 작업은 허용되지 않습니다.' } } });
            return;
        }
        if (this.permissionMode === 'acceptEdits') {
            const editToolKeywords = ['write', 'edit', 'create', 'str_replace', 'patch', 'insert', 'delete', 'rename', 'move', 'notebook'];
            const isEditTool = editToolKeywords.some(k => toolName.toLowerCase().includes(k));
            if (isEditTool) {
                if (!this.options.headless) console.log(`\n[Accept Edits] 자동 허용: ${toolName}`);
                this.writeJson({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: { behavior: 'allow', updatedInput: toolInput } } });
                return;
            }
        }

        if (!this.options.headless) {
            console.log(`\n[권한 요청] ${toolName} — 원격 응답 대기 중...`);
        }

        // PWA에 input-request 전송
        const inputRequest: SessionMessageInputRequest = {
            t: 'input-request',
            requestId,
            requestType: 'permission',
            toolName,
            toolInput: toolInput ? JSON.stringify(toolInput) : undefined,
        };
        this.options.onPermissionRequest(inputRequest);

        // Promise로 PWA 응답 대기 (inputRequest도 저장 → 재연결 시 재전송용)
        const result = await new Promise<{ behavior: 'allow' | 'deny'; updatedInput?: Record<string, unknown>; message?: string }>((resolve) => {
            this.pendingPermissions.set(requestId, { resolve, inputRequest });
        });

        // Claude에 control_response 전송
        const response: Record<string, unknown> = {
            type: 'control_response',
            response: {
                subtype: 'success',
                request_id: requestId,
                response: result.behavior === 'allow'
                    ? { behavior: 'allow', updatedInput: result.updatedInput || toolInput }
                    : { behavior: 'deny', message: result.message || 'User denied the tool call' },
            },
        };

        this.writeJson(response);

        if (!this.options.headless) {
            console.log(`[권한 ${result.behavior === 'allow' ? '허용' : '거부'}] ${toolName}`);
        }
    }

    private writeJson(obj: Record<string, unknown>): void {
        if (!this.child?.stdin || this.destroyed) return;

        try {
            this.child.stdin.write(JSON.stringify(obj) + '\n');
        } catch (err) {
            console.error('[ClaudeStream] stdin 쓰기 실패:', err);
        }
    }
}

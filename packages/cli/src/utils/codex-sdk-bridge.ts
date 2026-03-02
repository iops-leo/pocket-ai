import type { SessionPayload } from '@pocket-ai/wire';
import type {
    ThreadEvent,
    ThreadItem,
    ThreadOptions,
} from '@openai/codex-sdk';

/**
 * Codex SDK 브릿지
 *
 * @openai/codex-sdk의 startThread() + runStreamed() API를 사용하여
 * Codex 에이전트와 구조화된 이벤트 기반 통신을 수행한다.
 * ClaudeStreamBridge와 동일한 인터페이스 패턴.
 */

export interface CodexSdkBridgeOptions {
    cwd: string;
    headless?: boolean;
    onMessage: (event: SessionPayload) => void;
    onReady: () => void;
    onExit: (code: number) => void;
}

export class CodexSdkBridge {
    private thread: import('@openai/codex-sdk').Thread | null = null;
    private options: CodexSdkBridgeOptions;
    private destroyed = false;
    private abortController: AbortController | null = null;
    private _isWaitingForInput = true;
    private threadId: string | null = null;
    private running = false;

    constructor(options: CodexSdkBridgeOptions) {
        this.options = options;
    }

    get isWaitingForInput(): boolean {
        return this._isWaitingForInput;
    }

    /**
     * Codex SDK 인스턴스와 Thread를 초기화한다.
     */
    async start(): Promise<void> {
        const { Codex } = await import('@openai/codex-sdk');

        const codex = new Codex();

        const threadOptions: ThreadOptions = {
            workingDirectory: this.options.cwd,
            skipGitRepoCheck: true,
            approvalPolicy: 'never',
            sandboxMode: 'workspace-write',
        };

        this.thread = codex.startThread(threadOptions);
        this._isWaitingForInput = true;

        if (!this.options.headless) {
            console.log('[CodexSDK] Codex 세션 초기화 완료. 입력 대기 중...');
        }

        this.options.onReady();
    }

    /**
     * 사용자 메시지를 Codex에 전달하고 스트리밍 이벤트를 처리한다.
     */
    async sendMessage(text: string): Promise<void> {
        if (!this.thread || this.destroyed) return;
        if (this.running) {
            if (!this.options.headless) {
                console.log('[CodexSDK] 이전 요청 처리 중... 대기합니다.');
            }
            return;
        }

        this.running = true;
        this._isWaitingForInput = false;
        this.abortController = new AbortController();

        this.options.onMessage({ t: 'session-event', event: 'thinking-start' });

        try {
            const { events } = await this.thread.runStreamed(text, {
                signal: this.abortController.signal,
            });

            for await (const event of events) {
                if (this.destroyed) break;
                this.handleEvent(event);
            }
        } catch (err: any) {
            if (err.name === 'AbortError') {
                if (!this.options.headless) {
                    console.log('\n[CodexSDK] 요청이 중단되었습니다.');
                }
            } else {
                const errorMsg = err.message || String(err);
                this.options.onMessage({ t: 'text', text: `[Codex Error] ${errorMsg}` });
                if (!this.options.headless) {
                    console.error(`\n[CodexSDK] 오류: ${errorMsg}`);
                }
            }
        } finally {
            this.running = false;
            this._isWaitingForInput = true;
            this.abortController = null;
            this.options.onMessage({ t: 'session-event', event: 'stopped-typing' });
            this.options.onReady();
        }
    }

    /**
     * 현재 실행 중인 요청을 중단한다.
     */
    interrupt(): void {
        if (this.abortController) {
            this.abortController.abort();
            if (!this.options.headless) {
                console.log('[CodexSDK] 인터럽트 신호 전송');
            }
        }
    }

    /**
     * 브릿지를 정리한다.
     */
    kill(): void {
        this.destroyed = true;
        this.interrupt();
    }

    // ─── 이벤트 핸들링 ───

    private handleEvent(event: ThreadEvent): void {
        switch (event.type) {
            case 'thread.started':
                this.threadId = event.thread_id;
                if (!this.options.headless) {
                    console.log(`[CodexSDK] Thread 시작: ${event.thread_id.slice(0, 8)}...`);
                }
                break;

            case 'turn.started':
                // thinking-start는 sendMessage에서 이미 전송됨
                break;

            case 'turn.completed':
                this.options.onMessage({
                    t: 'session-event',
                    event: 'usage',
                    data: {
                        inputTokens: event.usage.input_tokens,
                        outputTokens: event.usage.output_tokens,
                        cachedInputTokens: event.usage.cached_input_tokens,
                    },
                });
                if (!this.options.headless) {
                    console.log(`\n[CodexSDK] 응답 완료. 입력 대기 중... (토큰: ${event.usage.output_tokens})`);
                }
                break;

            case 'turn.failed':
                this.options.onMessage({
                    t: 'text',
                    text: `[Codex Error] ${event.error.message}`,
                });
                if (!this.options.headless) {
                    console.error(`\n[CodexSDK] 턴 실패: ${event.error.message}`);
                }
                break;

            case 'item.started':
                this.handleItemStarted(event.item);
                break;

            case 'item.completed':
                this.handleItemCompleted(event.item);
                break;

            case 'item.updated':
                // 스트리밍 중간 업데이트: agent_message의 텍스트 스트리밍
                if (event.item.type === 'agent_message') {
                    // item.completed에서 최종 텍스트를 전송하므로 중간 업데이트는 콘솔에만 표시
                }
                break;

            case 'error':
                this.options.onMessage({
                    t: 'text',
                    text: `[Codex Error] ${event.message}`,
                });
                break;
        }
    }

    private handleItemStarted(item: ThreadItem): void {
        switch (item.type) {
            case 'command_execution':
                this.options.onMessage({
                    t: 'tool-call',
                    id: item.id,
                    name: 'command_execution',
                    arguments: JSON.stringify({ command: item.command }),
                });
                if (!this.options.headless) {
                    console.log(`\n⏺ command: ${item.command}`);
                }
                break;

            case 'file_change':
                this.options.onMessage({
                    t: 'tool-call',
                    id: item.id,
                    name: 'file_change',
                    arguments: JSON.stringify({ changes: item.changes }),
                });
                if (!this.options.headless) {
                    const summary = item.changes.map(c => `${c.kind} ${c.path}`).join(', ');
                    console.log(`\n⏺ file_change: ${summary}`);
                }
                break;

            case 'mcp_tool_call':
                this.options.onMessage({
                    t: 'tool-call',
                    id: item.id,
                    name: `${item.server}/${item.tool}`,
                    arguments: item.arguments ? JSON.stringify(item.arguments) : '',
                });
                if (!this.options.headless) {
                    console.log(`\n⏺ mcp: ${item.server}/${item.tool}`);
                }
                break;

            case 'web_search':
                this.options.onMessage({
                    t: 'tool-call',
                    id: item.id,
                    name: 'web_search',
                    arguments: JSON.stringify({ query: item.query }),
                });
                break;
        }
    }

    private handleItemCompleted(item: ThreadItem): void {
        switch (item.type) {
            case 'agent_message':
                if (item.text.trim()) {
                    this.options.onMessage({ t: 'text', text: item.text });
                    if (!this.options.headless) {
                        process.stdout.write(item.text);
                    }
                }
                break;

            case 'command_execution':
                this.options.onMessage({
                    t: 'tool-result',
                    id: item.id,
                    result: item.aggregated_output || `exit code: ${item.exit_code ?? 'unknown'}`,
                    ...(item.status === 'failed' ? { error: `Command failed (exit ${item.exit_code})` } : {}),
                });
                if (!this.options.headless) {
                    const output = item.aggregated_output?.slice(0, 200) || '';
                    console.log(`  → ${output}${item.aggregated_output && item.aggregated_output.length > 200 ? '...' : ''}`);
                }
                break;

            case 'file_change':
                this.options.onMessage({
                    t: 'tool-result',
                    id: item.id,
                    result: item.changes.map(c => `${c.kind}: ${c.path}`).join('\n'),
                    ...(item.status === 'failed' ? { error: 'Patch apply failed' } : {}),
                });
                break;

            case 'mcp_tool_call': {
                let result = '';
                if (item.result?.content) {
                    result = item.result.content
                        .map((c: any) => typeof c.text === 'string' ? c.text : JSON.stringify(c))
                        .join('\n');
                }
                this.options.onMessage({
                    t: 'tool-result',
                    id: item.id,
                    result: result || '(no output)',
                    ...(item.error ? { error: item.error.message } : {}),
                });
                break;
            }

            case 'web_search':
                this.options.onMessage({
                    t: 'tool-result',
                    id: item.id,
                    result: `Web search completed: ${item.query}`,
                });
                break;

            case 'reasoning':
                // reasoning은 내부 사고과정이므로 콘솔에만 표시
                if (!this.options.headless && item.text.trim()) {
                    console.log(`  [reasoning] ${item.text.slice(0, 100)}...`);
                }
                break;

            case 'error':
                this.options.onMessage({
                    t: 'text',
                    text: `[Codex Error] ${item.message}`,
                });
                break;

            case 'todo_list':
                // todo_list는 PWA에 텍스트로 전송
                if (item.items.length > 0) {
                    const todoText = item.items
                        .map(i => `${i.completed ? '✓' : '○'} ${i.text}`)
                        .join('\n');
                    this.options.onMessage({ t: 'text', text: todoText });
                }
                break;
        }
    }
}

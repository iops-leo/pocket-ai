'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Copy, Check, ArrowDown, Zap, ShieldCheck, ShieldX, ShieldQuestion } from 'lucide-react';
import { ToolCard } from './ToolCard';
import { OrchestratorWorkerCard } from './OrchestratorWorkerCard';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useTranslations } from 'next-intl';

type TextMsg = { kind: 'text'; id: string; content: string; role: 'user' | 'assistant'; timestamp?: number };
type ToolMsg = { kind: 'tool'; id: string; name: string; args: string; output?: string; status: 'running' | 'done' | 'error'; error?: string; startTime?: number };
type PermissionMsg = {
    kind: 'permission';
    id: string;
    requestType: 'permission' | 'selection';
    toolName?: string;
    toolInput?: string;
    message?: string;
    options?: string[];
    status: 'pending' | 'approved' | 'denied';
};
export type ChatMessage = TextMsg | ToolMsg | PermissionMsg;

function formatTime(ts?: number): string {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const t = useTranslations('common');
    const tc = useTranslations('chat');

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard not available */ }
    };

    return (
        <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-300 transition-colors"
            title={tc('copyMessage')}
        >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            {copied ? t('copied') : t('copy')}
        </button>
    );
}

const THINKING_PHRASES = ['생각하는 중', '분석하는 중', '코드 작성 중', '처리하는 중', '답변 작성 중'];

function ThinkingIndicator({ seconds }: { seconds: number }) {
    const phraseIndex = Math.floor(seconds / 3) % THINKING_PHRASES.length;
    const phrase = THINKING_PHRASES[phraseIndex];
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${seconds}s`;

    return (
        <div className="flex justify-start px-3">
            <div className="bg-gray-800/80 border border-gray-700/50 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="text-blue-400 animate-spin inline-block" style={{ animationDuration: '2s' }}>✽</span>
                    <span className="text-sm text-gray-300">{phrase}…</span>
                    {seconds > 0 && (
                        <span className="text-xs text-gray-500 font-mono">{timeStr}</span>
                    )}
                </div>
            </div>
        </div>
    );
}

function EmptyState() {
    const t = useTranslations('chat');
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3 px-6">
            <div className="w-14 h-14 rounded-full bg-gray-800/50 flex items-center justify-center border border-gray-700/30 shadow-inner">
                <Zap size={22} className="text-blue-500/60" />
            </div>
            <p className="text-sm font-medium text-gray-400">{t('sessionReady')}</p>
            <p className="text-xs text-center text-gray-600 leading-relaxed">
                {t('sessionReadyHint1')}<br />
                {t('sessionReadyHint2')}
            </p>
        </div>
    );
}

function PermissionCard({ msg, onResponse }: { msg: PermissionMsg; onResponse?: (id: string, approved: boolean) => void }) {
    const t = useTranslations('chat');
    const isPending = msg.status === 'pending';

    let inputSummary = '';
    if (msg.toolInput) {
        try {
            const parsed = JSON.parse(msg.toolInput);
            if (parsed.command) inputSummary = parsed.command;
            else if (parsed.file_path) inputSummary = parsed.file_path;
            else inputSummary = msg.toolInput;
        } catch {
            inputSummary = msg.toolInput;
        }
        if (inputSummary.length > 120) inputSummary = inputSummary.slice(0, 120) + '…';
    }

    const StatusIcon = msg.status === 'approved' ? ShieldCheck
        : msg.status === 'denied' ? ShieldX : ShieldQuestion;
    const statusColor = msg.status === 'approved' ? 'text-emerald-400'
        : msg.status === 'denied' ? 'text-red-400' : 'text-amber-400';
    const statusBorder = msg.status === 'approved' ? 'border-emerald-500/30'
        : msg.status === 'denied' ? 'border-red-500/30' : 'border-amber-500/30';
    const statusBg = msg.status === 'approved' ? 'bg-emerald-500/5'
        : msg.status === 'denied' ? 'bg-red-500/5' : 'bg-amber-500/5';

    return (
        <div className="flex justify-start px-0">
            <div className={`max-w-[85%] w-full rounded-xl border ${statusBorder} ${statusBg} overflow-hidden`}>
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/50">
                    <StatusIcon size={16} className={statusColor} />
                    <span className="text-xs font-medium text-gray-300">
                        {msg.requestType === 'permission' ? t('permissionRequest') : t('selectionRequest')}
                    </span>
                    {!isPending && (
                        <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded ${msg.status === 'approved' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                            {msg.status === 'approved' ? t('permissionApproved') : t('permissionDenied')}
                        </span>
                    )}
                </div>
                <div className="px-3 py-2 space-y-1.5">
                    {msg.toolName && (
                        <p className="text-sm text-gray-200">
                            <span className="font-mono text-amber-300 text-xs bg-amber-500/10 px-1.5 py-0.5 rounded">{msg.toolName}</span>
                        </p>
                    )}
                    {inputSummary && (
                        <p className="text-xs text-gray-400 font-mono break-all leading-relaxed">{inputSummary}</p>
                    )}
                    {msg.message && <p className="text-sm text-gray-300">{msg.message}</p>}
                    {msg.requestType === 'selection' && msg.options && isPending && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {msg.options.map((opt, i) => (
                                <button key={i} onClick={() => onResponse?.(msg.id, true)}
                                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-700/50 border border-gray-600/50 text-gray-200 hover:bg-gray-600/50 transition-colors">
                                    {opt}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {msg.requestType === 'permission' && isPending && (
                    <div className="flex gap-2 px-3 py-2.5 border-t border-gray-800/50">
                        <button onClick={() => onResponse?.(msg.id, true)}
                            className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-500/80 text-white transition-colors active:scale-[0.98]">
                            {t('permissionApprove')}
                        </button>
                        <button onClick={() => onResponse?.(msg.id, false)}
                            className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-gray-700/60 hover:bg-gray-600/60 text-gray-300 border border-gray-600/50 transition-colors active:scale-[0.98]">
                            {t('permissionDeny')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

interface MessageListProps {
    messages: ChatMessage[];
    isAiThinking?: boolean;
    isHistoryLoading?: boolean;
    onOptionSelect?: (option: string) => void;
    onPermissionResponse?: (requestId: string, approved: boolean) => void;
    thinkingSeconds?: number;
}

export function MessageList({ messages, isAiThinking, isHistoryLoading, onOptionSelect, onPermissionResponse, thinkingSeconds = 0 }: MessageListProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const isNearBottomRef = useRef(true);

    const isInitialScrollRef = useRef(true);

    const scrollToBottom = useCallback(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const handleScroll = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        isNearBottomRef.current = nearBottom;
        setShowScrollBtn(!nearBottom);
    }, []);

    useEffect(() => {
        if (isNearBottomRef.current) {
            const behavior = (isInitialScrollRef.current || isHistoryLoading) ? 'instant' : 'smooth';
            bottomRef.current?.scrollIntoView({ behavior });
            isInitialScrollRef.current = false;
        }
    }, [messages, isAiThinking, isHistoryLoading]);

    if (messages.length === 0 && !isAiThinking) {
        return <EmptyState />;
    }

    return (
        <div className="flex-1 relative min-h-0">
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="absolute inset-0 overflow-y-auto py-4"
            >
                <div className="max-w-3xl mx-auto px-3 space-y-3">
                    {messages.map(msg => {
                        if (msg.kind === 'text') {
                            if (msg.role === 'user') {
                                return (
                                    <div key={msg.id} className="flex justify-end group">
                                        <div className="max-w-[82%]">
                                            <div className="bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-[14px] leading-relaxed shadow-sm">
                                                <p className="whitespace-pre-wrap break-words">{msg.content.trimEnd()}</p>
                                            </div>
                                            {/* 사용자 메시지도 복사 버튼 + 타임스탬프 */}
                                            <div className="flex justify-end items-center gap-2 mt-0.5 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {msg.timestamp && (
                                                    <span className="text-[10px] text-gray-600">{formatTime(msg.timestamp)}</span>
                                                )}
                                                <CopyButton text={msg.content} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            }
                            // assistant
                            return (
                                <div key={msg.id} className="flex justify-start group">
                                    <div className="max-w-[85%] w-full">
                                        <div className="bg-gray-800/80 border border-gray-700/50 text-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 text-[13.5px] leading-relaxed shadow-sm overflow-hidden">
                                            <MarkdownRenderer content={msg.content.trimEnd()} onOptionSelect={onOptionSelect} />
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 pl-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {msg.timestamp && (
                                                <span className="text-[10px] text-gray-600">{formatTime(msg.timestamp)}</span>
                                            )}
                                            <CopyButton text={msg.content} />
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        if (msg.kind === 'permission') {
                            return (
                                <PermissionCard
                                    key={msg.id}
                                    msg={msg}
                                    onResponse={onPermissionResponse}
                                />
                            );
                        }
                        // ask_* 툴은 오케스트레이터 Worker 전용 카드로 렌더링
                        if (msg.name.startsWith('ask_')) {
                            return (
                                <OrchestratorWorkerCard
                                    key={msg.id}
                                    name={msg.name}
                                    args={msg.args}
                                    output={msg.output}
                                    status={msg.status}
                                    startTime={msg.startTime}
                                />
                            );
                        }
                        return (
                            <ToolCard
                                key={msg.id}
                                name={msg.name}
                                args={msg.args}
                                output={msg.output}
                                status={msg.status}
                                error={msg.error}
                            />
                        );
                    })}
                    {isAiThinking && <ThinkingIndicator seconds={thinkingSeconds} />}
                    <div ref={bottomRef} />
                </div>
            </div>

            {showScrollBtn && (
                <button
                    onClick={scrollToBottom}
                    className="absolute bottom-3 right-3 w-8 h-8 bg-gray-800 border border-gray-700 rounded-full flex items-center justify-center shadow-lg hover:bg-gray-700 transition-colors z-10"
                    title="하단으로 이동"
                >
                    <ArrowDown size={16} className="text-gray-300" />
                </button>
            )}
        </div>
    );
}

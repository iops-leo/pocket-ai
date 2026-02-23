'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Copy, Check, ArrowDown, Zap } from 'lucide-react';
import { ToolCard } from './ToolCard';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useTranslations } from 'next-intl';

type TextMsg = { kind: 'text'; id: string; content: string; role: 'user' | 'assistant'; timestamp?: number };
type ToolMsg = { kind: 'tool'; id: string; name: string; args: string; output?: string; status: 'running' | 'done' | 'error'; error?: string };
export type ChatMessage = TextMsg | ToolMsg;

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
            className="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors mt-1"
            title={tc('copyMessage')}
        >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            {copied ? t('copied') : t('copy')}
        </button>
    );
}

function ThinkingIndicator() {
    return (
        <div className="flex justify-start">
            <div className="bg-gray-800/80 border border-gray-700/50 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3 px-6">
            <div className="w-12 h-12 rounded-full bg-gray-800/50 flex items-center justify-center border border-gray-700/40">
                <Zap size={20} className="text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-400">원격 세션 연결됨</p>
            <p className="text-xs text-center text-gray-600 leading-relaxed">
                AI CLI에 메시지를 전송하세요.<br />
                응답이 실시간으로 표시됩니다.
            </p>
        </div>
    );
}

interface MessageListProps {
    messages: ChatMessage[];
    isAiThinking?: boolean;
}

export function MessageList({ messages, isAiThinking }: MessageListProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const isNearBottomRef = useRef(true);

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
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isAiThinking]);

    if (messages.length === 0 && !isAiThinking) {
        return <EmptyState />;
    }

    return (
        <div className="flex-1 relative min-h-0">
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="absolute inset-0 overflow-y-auto px-3 py-4 space-y-2"
            >
                {messages.map(msg => {
                    if (msg.kind === 'text') {
                        if (msg.role === 'user') {
                            return (
                                <div key={msg.id} className="flex justify-end">
                                    <div className="max-w-[80%]">
                                        <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed shadow-sm">
                                            <p className="whitespace-pre-wrap break-words">{msg.content.trimEnd()}</p>
                                        </div>
                                        <div className="flex justify-end items-center gap-2 mt-0.5 pr-1">
                                            {msg.timestamp && (
                                                <span className="text-[10px] text-gray-600">{formatTime(msg.timestamp)}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        // assistant - render markdown with code highlighting
                        return (
                            <div key={msg.id} className="flex justify-start">
                                <div className="max-w-[95%] w-full">
                                    <div className="bg-gray-800/80 border border-gray-700/50 text-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5 text-[13px] leading-relaxed shadow-sm overflow-hidden">
                                        <MarkdownRenderer content={msg.content.trimEnd()} />
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 pl-1">
                                        {msg.timestamp && (
                                            <span className="text-[10px] text-gray-600">{formatTime(msg.timestamp)}</span>
                                        )}
                                        <CopyButton text={msg.content} />
                                    </div>
                                </div>
                            </div>
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
                {isAiThinking && <ThinkingIndicator />}
                <div ref={bottomRef} />
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

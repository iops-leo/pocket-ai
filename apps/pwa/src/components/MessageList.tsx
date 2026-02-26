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
            className="inline-flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-300 transition-colors"
            title={tc('copyMessage')}
        >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            {copied ? t('copied') : t('copy')}
        </button>
    );
}

function ThinkingIndicator() {
    return (
        <div className="flex justify-start px-3">
            <div className="bg-gray-800/80 border border-gray-700/50 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:300ms]" />
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

interface MessageListProps {
    messages: ChatMessage[];
    isAiThinking?: boolean;
    onOptionSelect?: (option: string) => void;
}

export function MessageList({ messages, isAiThinking, onOptionSelect }: MessageListProps) {
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

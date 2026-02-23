'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Loader2, WifiOff, ClipboardPaste, History, ArrowUp } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { generateECDHKeyPair, deriveSharedSecret, importPublicKey, exportPublicKey, encrypt, decrypt, unwrapSessionKey, type EncryptedData, type MessagesResponse } from '@pocket-ai/wire';
import { MessageList, type ChatMessage } from './MessageList';
import { useTranslations } from 'next-intl';

interface TerminalChatProps {
    sessionId: string;
    onBack: () => void;
    embedded?: boolean;
}

export function TerminalChat({ sessionId, onBack, embedded = false }: TerminalChatProps) {
    const t = useTranslations('chat');
    const [isConnecting, setIsConnecting] = useState(true);
    const [isDisconnected, setIsDisconnected] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [sessionMeta, setSessionMeta] = useState<{ engine?: string; hostname?: string; cwd?: string }>({});
    const [isAiThinking, setIsAiThinking] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [historyLoaded, setHistoryLoaded] = useState(false);

    const sharedSecretRef = useRef<CryptoKey | null>(null);
    const sessionKeyRef = useRef<CryptoKey | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const lastSeqRef = useRef<number | undefined>(undefined);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    // 일시적 disconnect(초기 로딩 등)에서 오버레이 번쩍임 방지용 grace period 타이머
    const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 텍스트에어리어 높이 자동 조절
    const adjustTextareaHeight = useCallback(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        const maxHeight = 160; // 최대 5줄 정도
        ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px';
    }, []);

    // 메시지 이력 로드
    const loadMessageHistory = useCallback(async (sharedSecret: CryptoKey) => {
        const token = localStorage.getItem('pocket_ai_token');
        if (!token || historyLoaded) return;

        setIsLoadingHistory(true);
        try {
            const SERVER_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const res = await fetch(`${SERVER_URL}/api/sessions/${sessionId}/messages?limit=100`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch history');

            const json = await res.json();
            const data = json.data as MessagesResponse;

            const decryptedMessages: ChatMessage[] = [];
            for (const msg of data.messages) {
                try {
                    const decryptedJson = await decrypt(msg.encryptedBody, sharedSecret);
                    const parsed = JSON.parse(decryptedJson);

                    if (parsed.t === 'text') {
                        decryptedMessages.push({
                            kind: 'text',
                            id: msg.id,
                            role: msg.sender === 'pwa' ? 'user' : 'assistant',
                            content: parsed.text,
                            timestamp: new Date(msg.createdAt).getTime(),
                        });
                    } else if (parsed.t === 'tool-call') {
                        decryptedMessages.push({
                            kind: 'tool',
                            id: parsed.id,
                            name: parsed.name,
                            args: parsed.arguments,
                            status: 'done',
                        });
                    }
                } catch {
                    console.debug('Skipping message with different key:', msg.id);
                }
            }

            if (decryptedMessages.length > 0) {
                setMessages(decryptedMessages);
                lastSeqRef.current = data.messages[data.messages.length - 1]?.seq;
            }
            setHistoryLoaded(true);
        } catch (e) {
            console.error('Failed to load history:', e);
        } finally {
            setIsLoadingHistory(false);
        }
    }, [sessionId, historyLoaded]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initConnection = useCallback(async (socket: Socket) => {
        const token = localStorage.getItem('pocket_ai_token');
        if (!token) return;

        try {
            const keyPair = await generateECDHKeyPair();
            const pubBase64 = await exportPublicKey(keyPair.publicKey);

            socket.emit('session-join', { sessionId, token });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            socket.once('join-success', async (data: any) => {
                try {
                    const cliPubKey = await importPublicKey(data.publicKey);
                    sharedSecretRef.current = await deriveSharedSecret(keyPair.privateKey, cliPubKey);

                    socket.emit('key-exchange', {
                        sessionId,
                        publicKey: pubBase64,
                        sender: 'pwa'
                    });

                    if (data.metadata) {
                        setSessionMeta(data.metadata);
                    }

                    socket.once('session-key', async (skPayload: { sessionId: string; wrappedKey: EncryptedData }) => {
                        try {
                            if (!sharedSecretRef.current) throw new Error('No shared secret');
                            sessionKeyRef.current = await unwrapSessionKey(skPayload.wrappedKey, sharedSecretRef.current);
                            loadMessageHistory(sessionKeyRef.current);
                            setIsConnecting(false);
                            setIsDisconnected(false);
                        } catch (e) {
                            console.error('[Pocket AI] Session key unwrap 실패:', e);
                            sessionKeyRef.current = sharedSecretRef.current;
                            loadMessageHistory(sharedSecretRef.current!);
                            setIsConnecting(false);
                            setIsDisconnected(false);
                        }
                    });

                    setTimeout(() => {
                        if (!sessionKeyRef.current && sharedSecretRef.current) {
                            sessionKeyRef.current = sharedSecretRef.current;
                            loadMessageHistory(sharedSecretRef.current!);
                            setIsConnecting(false);
                            setIsDisconnected(false);
                        }
                    }, 5000);
                } catch (e) {
                    console.error('E2E Setup Failed', e);
                    setMessages(prev => [...prev, {
                        kind: 'text',
                        id: crypto.randomUUID(),
                        role: 'assistant' as const,
                        content: '[Pocket AI] E2E Setup Failed.\n'
                    }]);
                }
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            socket.once('join-error', (err: any) => {
                console.error('Failed to join session', err);
                setMessages(prev => [...prev, {
                    kind: 'text',
                    id: crypto.randomUUID(),
                    role: 'assistant' as const,
                    content: `[Pocket AI] Failed to join session: ${err.error}\n`
                }]);
                setIsConnecting(false);
            });
        } catch (err) {
            console.error(err);
        }
    }, [sessionId, loadMessageHistory]);

    useEffect(() => {
        const SERVER_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const socket = io(SERVER_URL, {
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            // 재연결 시 pending disconnect 타이머 취소
            if (disconnectTimerRef.current) {
                clearTimeout(disconnectTimerRef.current);
                disconnectTimerRef.current = null;
            }
            setIsDisconnected(false);
            setIsConnecting(true);
            initConnection(socket);
        });

        socket.on('disconnect', (reason) => {
            console.warn('Socket disconnected:', reason);
            setIsConnecting(false);
            sharedSecretRef.current = null;
            sessionKeyRef.current = null;
            // 1.5초 grace period: 빠른 재연결 시 오버레이 표시 안 함
            disconnectTimerRef.current = setTimeout(() => {
                setIsDisconnected(true);
            }, 1500);
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        socket.on('update', async (payload: any) => {
            const decryptKey = sessionKeyRef.current || sharedSecretRef.current;
            if (payload.sender === 'cli' && payload.body && decryptKey) {
                try {
                    const decryptedJson = await decrypt(payload.body, decryptKey);
                    const msg = JSON.parse(decryptedJson);

                    if (msg.t === 'text') {
                        setIsAiThinking(false);
                        setMessages(prev => [...prev, {
                            kind: 'text',
                            id: crypto.randomUUID(),
                            role: 'assistant' as const,
                            content: msg.text,
                            timestamp: Date.now(),
                        }]);
                    }

                    if (msg.t === 'tool-call') {
                        setIsAiThinking(false);
                        setMessages(prev => [...prev, {
                            kind: 'tool',
                            id: msg.id,
                            name: msg.name,
                            args: msg.arguments,
                            status: 'running' as const,
                        }]);
                    }

                    if (msg.t === 'tool-result') {
                        setMessages(prev => prev.map(m =>
                            m.kind === 'tool' && m.id === msg.id
                                ? { ...m, output: msg.result, status: (msg.error ? 'error' : 'done') as 'error' | 'done', error: msg.error }
                                : m
                        ));
                    }
                } catch (e) {
                    console.error('Failed to decrypt CLI message', e);
                }
            }
        });

        return () => {
            socket.disconnect();
            if (disconnectTimerRef.current) {
                clearTimeout(disconnectTimerRef.current);
            }
        };
    }, [sessionId, initConnection]);

    // 세션 변경 시 상태 초기화
    useEffect(() => {
        setMessages([]);
        setHistoryLoaded(false);
        lastSeqRef.current = undefined;
        sessionKeyRef.current = null;
    }, [sessionId]);

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            const encryptKey = sessionKeyRef.current || sharedSecretRef.current;
            if (text && socketRef.current && encryptKey && !isDisconnected && !isConnecting) {
                const msgStr = JSON.stringify({ t: 'text', text: text });
                const encryptedBody = await encrypt(msgStr, encryptKey);
                socketRef.current.emit('update', {
                    t: 'encrypted',
                    sessionId,
                    sender: 'pwa',
                    body: encryptedBody
                });
            }
        } catch (e) {
            console.error('Failed to read clipboard', e);
        }
    };

    // 텍스트에어리어: Enter = 전송, Shift+Enter = 줄바꿈
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
        }
    };


    // 옵션 선택 시 해당 텍스트를 메시지로 전송
    const handleOptionSelect = useCallback(async (option: string) => {
        const encryptKey = sessionKeyRef.current || sharedSecretRef.current;
        if (!socketRef.current || !encryptKey || isDisconnected) return;

        setIsAiThinking(true);
        setMessages(prev => [...prev, {
            kind: 'text',
            id: crypto.randomUUID(),
            role: 'user' as const,
            content: option,
            timestamp: Date.now(),
        }]);

        try {
            const msgStr = JSON.stringify({ t: 'text', text: option + '\r' });
            const encryptedBody = await encrypt(msgStr, encryptKey);
            socketRef.current.emit('update', {
                t: 'encrypted',
                sessionId,
                sender: 'pwa',
                body: encryptedBody
            });
        } catch (err) {
            console.error('Failed to send option', err);
        }
    }, [isDisconnected, sessionId]);

    const handleSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const encryptKey = sessionKeyRef.current || sharedSecretRef.current;
        if (!inputValue.trim() || !socketRef.current || !encryptKey || isDisconnected) return;

        const text = inputValue;
        setInputValue('');
        // 높이 초기화
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        setIsAiThinking(true);
        setMessages(prev => [...prev, {
            kind: 'text',
            id: crypto.randomUUID(),
            role: 'user' as const,
            content: text,
            timestamp: Date.now(),
        }]);

        try {
            const msgStr = JSON.stringify({ t: 'text', text: text + '\r' });
            const encryptedBody = await encrypt(msgStr, encryptKey);
            socketRef.current.emit('update', {
                t: 'encrypted',
                sessionId,
                sender: 'pwa',
                body: encryptedBody
            });
        } catch (err) {
            console.error('Failed to send message', err);
        }
    };

    // cwd를 더 읽기 좋게 표시
    const displayCwd = sessionMeta.cwd
        ? sessionMeta.cwd.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~')
        : null;

    return (
        <div className={`flex flex-col ${embedded ? 'h-full' : 'h-[100dvh]'} bg-gray-950 font-sans text-gray-100 overflow-hidden`}>
            {/* Header */}
            <header className="flex-none flex items-center justify-between px-3 py-2.5 border-b border-gray-800 bg-gray-900/80 backdrop-blur-md z-20">
                <div className="flex items-center gap-2.5 min-w-0">
                    <button onClick={onBack} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white flex-shrink-0">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            {/* 상태 표시 dot */}
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isDisconnected
                                ? 'bg-red-500'
                                : isConnecting
                                    ? 'bg-yellow-400 animate-pulse'
                                    : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                                }`} />
                            <h2 className="font-semibold text-sm text-white truncate">
                                {sessionMeta.engine
                                    ? sessionMeta.engine.charAt(0).toUpperCase() + sessionMeta.engine.slice(1)
                                    : sessionId.split('-')[0]}
                                {sessionMeta.hostname && (
                                    <span className="text-gray-400 font-normal ml-1.5">@ {sessionMeta.hostname}</span>
                                )}
                            </h2>
                        </div>
                        {displayCwd && (
                            <p className="text-[11px] text-gray-500 font-mono truncate mt-0.5" title={sessionMeta.cwd}>
                                {displayCwd}
                            </p>
                        )}
                    </div>
                </div>

                {/* 헤더 우측: 상태 뱃지 + 붙여넣기 버튼 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`hidden sm:inline text-[11px] px-2 py-0.5 rounded-full border font-medium ${isDisconnected
                        ? 'text-red-400 border-red-500/30 bg-red-500/10'
                        : isConnecting
                            ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
                            : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                        }`}>
                        {isDisconnected ? t('disconnected') : isConnecting ? t('connecting') : t('connected')}
                    </span>
                    {!isDisconnected && !isConnecting && (
                        <button
                            onClick={handlePaste}
                            className="p-2 flex items-center gap-1.5 text-gray-400 hover:text-white bg-gray-800/50 hover:bg-gray-700 rounded-lg transition-colors border border-gray-700/50"
                            title={t('clipboardPaste')}
                        >
                            <ClipboardPaste size={15} />
                        </button>
                    )}
                </div>
            </header>

            {/* Main chat area */}
            <main className="flex-1 relative w-full min-h-0 bg-gray-950 flex flex-col">
                {/* 연결 중 오버레이 */}
                {(isConnecting || isLoadingHistory) && !isDisconnected && (
                    <div className="absolute inset-0 z-10 bg-gray-950/85 flex flex-col items-center justify-center text-gray-300 gap-4 backdrop-blur-sm">
                        <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
                        <div className="text-center">
                            {isConnecting ? (
                                <>
                                    <p className="font-medium text-base">{t('securingConnection')}</p>
                                    <p className="text-sm text-gray-500 mt-1">{t('keyExchange')}</p>
                                </>
                            ) : (
                                <>
                                    <p className="font-medium text-base flex items-center gap-2 justify-center">
                                        <History size={16} />
                                        {t('restoringHistory')}
                                    </p>
                                    <p className="text-sm text-gray-500 mt-1">{t('decryptingMessages')}</p>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* 연결 끊김 오버레이 */}
                {isDisconnected && (
                    <div className="absolute inset-0 z-10 bg-gray-950/90 flex flex-col items-center justify-center text-gray-300 gap-5 backdrop-blur-md">
                        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                            <WifiOff className="w-7 h-7 text-red-400" />
                        </div>
                        <div className="text-center max-w-xs px-4">
                            <p className="font-semibold text-lg text-white">{t('connectionLost')}</p>
                            <p className="text-gray-400 mt-1.5 text-sm leading-relaxed">{t('connectionLostHint')}</p>
                        </div>
                        <Loader2 className="w-5 h-5 animate-spin text-gray-600 mt-2" />
                    </div>
                )}

                <MessageList messages={messages} isAiThinking={isAiThinking} onOptionSelect={handleOptionSelect} />

                {/* 입력 영역 */}
                <div className="flex-none bg-gray-950 w-full border-t border-gray-800/60">


                    {/* 입력창 */}
                    <div className="max-w-3xl mx-auto w-full px-3 pb-4 sm:pb-5 pt-3 flex items-center gap-2">
                        <div className="flex-1 bg-gray-900 border border-gray-700/60 rounded-2xl flex items-center px-4 py-2 shadow-xl transition-all focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/30">
                            <textarea
                                ref={textareaRef}
                                rows={1}
                                value={inputValue}
                                onChange={(e) => {
                                    setInputValue(e.target.value);
                                    adjustTextareaHeight();
                                }}
                                onKeyDown={handleKeyDown}
                                placeholder={t('inputPlaceholder')}
                                className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 outline-none resize-none text-[16px] leading-relaxed py-1 min-h-[26px] max-h-40 overflow-y-auto"
                                autoComplete="off"
                                style={{ height: 'auto' }}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => handleSend()}
                            disabled={!inputValue.trim() || isDisconnected}
                            className="flex-shrink-0 w-10 h-10 flex justify-center items-center bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-full transition-all active:scale-90 shadow-lg"
                        >
                            <ArrowUp size={18} strokeWidth={2.5} />
                        </button>
                    </div>

                    {/* Shift+Enter 힌트 */}
                    <p className="max-w-3xl mx-auto text-[10px] text-gray-700 text-center pb-2">
                        <kbd className="font-mono">Shift+Enter</kbd> 줄바꿈 · <kbd className="font-mono">Enter</kbd> 전송
                    </p>
                </div>
            </main>
        </div>
    );
}

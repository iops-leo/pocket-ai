'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Loader2, WifiOff, ClipboardPaste, ArrowUp, History } from 'lucide-react';
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

    // 메시지 이력 로드 (Happy 방식: 서버 DB에서 암호화된 메시지 조회 → 동일 키로 복호화)
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

            // 암호화된 메시지 복호화 (Happy 방식: CLI가 동일 키 유지)
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
                    // 복호화 실패 = 키 불일치 (새 세션이거나 키가 변경됨)
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

                    // Session key 수신 대기 (CLI가 ECDH shared secret으로 wrap해서 전송)
                    socket.once('session-key', async (skPayload: { sessionId: string; wrappedKey: EncryptedData }) => {
                        try {
                            if (!sharedSecretRef.current) throw new Error('No shared secret');
                            sessionKeyRef.current = await unwrapSessionKey(skPayload.wrappedKey, sharedSecretRef.current);
                            console.log('[Pocket AI] Session key 수신 완료');

                            // Session key로 이전 대화 이력 복호화
                            loadMessageHistory(sessionKeyRef.current);

                            setIsConnecting(false);
                            setIsDisconnected(false);
                        } catch (e) {
                            console.error('[Pocket AI] Session key unwrap 실패:', e);
                            // Fallback: ECDH shared secret 사용 (하위 호환)
                            sessionKeyRef.current = sharedSecretRef.current;
                            loadMessageHistory(sharedSecretRef.current!);
                            setIsConnecting(false);
                            setIsDisconnected(false);
                        }
                    });

                    // Timeout: 5초 내 session-key 미수신 시 ECDH shared secret으로 fallback
                    setTimeout(() => {
                        if (!sessionKeyRef.current && sharedSecretRef.current) {
                            console.warn('[Pocket AI] Session key timeout, falling back to ECDH shared secret');
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
            setIsDisconnected(false);
            setIsConnecting(true);
            initConnection(socket);
        });

        socket.on('disconnect', (reason) => {
            console.warn('Socket disconnected:', reason);
            setIsDisconnected(true);
            setIsConnecting(false);
            sharedSecretRef.current = null;
            sessionKeyRef.current = null;
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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Korean/Japanese/Chinese IME: isComposing=true means composition in progress
        // Don't submit during IME composition; wait for confirmed Enter
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
        }
    };

    // 옵션 선택 시 해당 텍스트를 메시지로 전송
    const handleOptionSelect = useCallback(async (option: string) => {
        const encryptKey = sessionKeyRef.current || sharedSecretRef.current;
        if (!socketRef.current || !encryptKey || isDisconnected) return;

        // Show sent message immediately in chat
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

        // Show sent message immediately in chat (always new bubble)
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

    return (
        <div className={`flex flex-col ${embedded ? 'h-full' : 'h-[100dvh]'} bg-gray-950 font-sans text-gray-100 overflow-hidden`}>
            <header className="flex-none flex items-center justify-between p-3 border-b border-gray-800 bg-gray-900/80 backdrop-blur-md z-20">
                <div className="flex items-center gap-3 min-w-0">
                    {/* Show back button only on mobile in embedded mode, always on standalone */}
                    {(!embedded || true) && (
                        <button onClick={onBack} className={`p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white flex-shrink-0 ${embedded ? 'lg:hidden' : ''}`}>
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <div className="min-w-0">
                        <h2 className="font-semibold text-sm md:text-base flex items-center gap-2 text-white">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isDisconnected ? 'bg-red-500' : isConnecting ? 'bg-yellow-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`}></span>
                            <span className="truncate">
                                {sessionMeta.engine
                                    ? sessionMeta.engine.charAt(0).toUpperCase() + sessionMeta.engine.slice(1)
                                    : sessionId.split('-')[0]}
                            </span>
                            <span className="hidden sm:inline text-gray-400 font-normal text-xs">
                                ({isDisconnected ? t('disconnected') : isConnecting ? t('connecting') : t('connected')})
                            </span>
                        </h2>
                        {sessionMeta.cwd && (
                            <p className="text-[11px] text-gray-500 truncate">
                                {sessionMeta.cwd.split('/').slice(-2).join('/')}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {!isDisconnected && !isConnecting && (
                        <button
                            onClick={handlePaste}
                            className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors border border-gray-700 hover:border-gray-600"
                            title={t('clipboardPaste')}
                        >
                            <ClipboardPaste size={14} />
                            <span className="hidden sm:inline">{t('paste')}</span>
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-1 relative w-full min-h-0 bg-gray-950 flex flex-col">
                {(isConnecting || isLoadingHistory) && !isDisconnected && (
                    <div className="absolute inset-0 z-10 bg-gray-950/80 flex flex-col items-center justify-center text-gray-300 gap-4 backdrop-blur-sm">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        <div className="text-center">
                            {isConnecting ? (
                                <>
                                    <p className="font-medium text-lg">{t('securingConnection')}</p>
                                    <p className="text-sm text-gray-500 mt-1">{t('keyExchange')}</p>
                                </>
                            ) : (
                                <>
                                    <p className="font-medium text-lg flex items-center gap-2">
                                        <History size={18} />
                                        {t('restoringHistory')}
                                    </p>
                                    <p className="text-sm text-gray-500 mt-1">{t('decryptingMessages')}</p>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {isDisconnected && (
                    <div className="absolute inset-0 z-10 bg-gray-950/90 flex flex-col items-center justify-center text-gray-300 gap-5 backdrop-blur-md">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 shadow-lg">
                            <WifiOff className="w-8 h-8 text-red-400" />
                        </div>
                        <div className="text-center max-w-sm px-4">
                            <p className="font-semibold text-xl text-white">{t('connectionLost')}</p>
                            <p className="text-gray-400 mt-2 text-sm leading-relaxed">{t('connectionLostHint')}</p>
                        </div>
                        <Loader2 className="w-5 h-5 animate-spin text-gray-500 mt-4" />
                    </div>
                )}

                <MessageList messages={messages} isAiThinking={isAiThinking} onOptionSelect={handleOptionSelect} />

                {/* Input bar */}
                <div className="flex-none bg-gray-950 w-full border-t border-gray-800/60">
                    {/* Quick Action Chips */}
                    {!isDisconnected && !isConnecting && (
                        <div className="w-full px-4 pt-2 overflow-x-auto no-scrollbar flex gap-2 snap-x">
                            {[
                                { label: '🔄 Claude', cmd: '/switch claude' },
                                { label: '💎 Gemini', cmd: '/switch gemini' },
                                { label: '⚡ Codex', cmd: '/switch codex' },
                                { label: `🧹 ${t('clearScreen')}`, cmd: 'clear' },
                            ].map((action, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setInputValue(action.cmd)}
                                    className="snap-start whitespace-nowrap px-3 py-1.5 rounded-full bg-gray-800/80 hover:bg-gray-700 text-gray-300 text-xs font-medium border border-gray-700/50 backdrop-blur-md transition-colors"
                                >
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="w-full px-4 pb-4 sm:pb-5 pt-2 flex items-center">
                        <form
                            onSubmit={handleSend}
                            className="bg-gray-900 border border-gray-700/60 rounded-full flex items-center pr-2 pl-4 py-1.5 shadow-xl w-full transition-all focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/50"
                        >
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={t('inputPlaceholder')}
                                className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 outline-none h-10 text-[16px]"
                                autoComplete="off"
                            />
                            <button
                                type="submit"
                                disabled={!inputValue.trim() || isDisconnected}
                                className="w-9 h-9 flex justify-center items-center bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-full transition-colors ml-2 flex-shrink-0"
                            >
                                <ArrowUp size={18} strokeWidth={2.5} />
                            </button>
                        </form>
                    </div>
                </div>
            </main>
        </div>
    );
}

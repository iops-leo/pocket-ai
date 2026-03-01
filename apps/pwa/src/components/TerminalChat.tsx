'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Loader2, WifiOff, ClipboardPaste, History, ArrowUp, SlidersHorizontal, Network, Pencil, Trash2 } from 'lucide-react';
import { ChatSettingsPanel, type ChatSettings } from './ChatSettingsPanel';
import { SlashCommandDropdown, type SlashCommand } from './SlashCommandDropdown';
import { io, Socket } from 'socket.io-client';
import { generateECDHKeyPair, deriveSharedSecret, importPublicKey, exportPublicKey, encrypt, decrypt, unwrapSessionKey, type EncryptedData } from '@pocket-ai/wire';
import { MessageList, type ChatMessage } from './MessageList';
import { useTranslations } from 'next-intl';

interface TerminalChatProps {
    sessionId: string;
    onBack: () => void;
    embedded?: boolean;
    onRenameSession?: (name: string) => void;
    onDeleteSession?: () => void;
}

type SessionMeta = {
    sessionName?: string;
    engine?: string;
    hostname?: string;
    cwd?: string;
};

const sessionUiCache = new Map<string, { messages: ChatMessage[]; sessionMeta: SessionMeta }>();

function makeKeyReadySignal() {
    let res: () => void;
    const promise = new Promise<void>(r => { res = r; });
    return { promise, resolve: () => res() };
}

export function TerminalChat({ sessionId, onBack, embedded = false, onRenameSession, onDeleteSession }: TerminalChatProps) {
    const t = useTranslations('chat');
    const [isConnecting, setIsConnecting] = useState(true);
    const [isDisconnected, setIsDisconnected] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [sessionMeta, setSessionMeta] = useState<SessionMeta>({});
    const [isAiThinking, setIsAiThinking] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [systemError, setSystemError] = useState<string | null>(null);
    const [chatSettingsTab, setChatSettingsTab] = useState<'session' | 'workers' | null>(null);
    const [chatSettings, setChatSettings] = useState<ChatSettings>({ permissionMode: 'default', model: 'default', customWorkers: [], builtinWorkers: { gemini: true, codex: true, aider: true } });

    // 새 상태
    const [thinkingSeconds, setThinkingSeconds] = useState(0);
    const [thinkingTokens, setThinkingTokens] = useState(0);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // 슬래시 명령어
    const [slashCommands, setSlashCommands] = useState<SlashCommand[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const cached = localStorage.getItem(`pocket_ai_slash_${sessionId}`);
            return cached ? JSON.parse(cached) : [];
        } catch { return []; }
    });
    const [showSlashDropdown, setShowSlashDropdown] = useState(false);

    const sharedSecretRef = useRef<CryptoKey | null>(null);
    const sessionKeyRef = useRef<CryptoKey | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const lastSeqRef = useRef<number | undefined>(undefined);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    // 일시적 disconnect(초기 로딩 등)에서 오버레이 번쩍임 방지용 grace period 타이머
    const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const historyLoadedRef = useRef(false);
    const hasWarmCacheRef = useRef(false);
    // CLI 로컬 이력 스트리밍 중 플래그 (서버 이력 fetch와 충돌 방지)
    const cliHistoryActiveRef = useRef(false);
    const loadMessageHistoryRef = useRef<(key: CryptoKey, options?: { silent?: boolean }) => Promise<void>>(async () => { });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initConnectionRef = useRef<(socket: any) => Promise<void>>(async () => { });
    const prevThinkingRef = useRef(false);
    // 세션키 준비 신호: 재연결 시 update 이벤트가 session-key 처리 전에 도착하는 레이스 컨디션 방지
    const keyReadyRef = useRef(makeKeyReadySignal());

    // 시스템 에러 자동 해제 (8초)
    useEffect(() => {
        if (!systemError) return;
        const timer = setTimeout(() => setSystemError(null), 8000);
        return () => clearTimeout(timer);
    }, [systemError]);

    // 경과 시간 타이머
    useEffect(() => {
        if (!isAiThinking) { setThinkingSeconds(0); return; }
        const start = Date.now();
        const interval = setInterval(() => {
            setThinkingSeconds(Math.floor((Date.now() - start) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [isAiThinking]);

    // 알림 권한 요청 (최초 1회)
    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    // AI 응답 완료 시 알림 (페이지 비포커스 시)
    useEffect(() => {
        if (prevThinkingRef.current && !isAiThinking) {
            if (typeof window !== 'undefined' && 'Notification' in window &&
                Notification.permission === 'granted' && !document.hasFocus()) {
                new Notification('Pocket AI', { body: '새 응답이 도착했습니다' });
            }
        }
        prevThinkingRef.current = isAiThinking;
    }, [isAiThinking]);

    // 텍스트에어리어 높이 자동 조절
    const adjustTextareaHeight = useCallback(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        const maxHeight = 160; // 최대 5줄 정도
        ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px';
    }, []);

    // 메시지 이력 로드 — Pure Relay: 서버에 이력 없음, CLI가 history-start/end로 전송
    // 이 함수는 key exchange 완료 신호 역할만 함 (실제 이력은 소켓 update 핸들러에서 처리)
    const loadMessageHistory = useCallback(async (_sharedSecret: CryptoKey, _options?: { silent?: boolean }) => { // eslint-disable-line @typescript-eslint/no-unused-vars
        historyLoadedRef.current = true;
    }, []);

    // ref 동기화: connect 이벤트에서 항상 최신 함수 사용
    loadMessageHistoryRef.current = loadMessageHistory;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initConnection = useCallback(async (socket: Socket) => {
        const token = localStorage.getItem('pocket_ai_token');
        if (!token) return;

        // 재연결 시 keyReady 신호 리셋
        keyReadyRef.current = makeKeyReadySignal();

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
                            keyReadyRef.current.resolve(); // update 이벤트 대기 해제
                            loadMessageHistoryRef.current(sessionKeyRef.current, { silent: hasWarmCacheRef.current });
                            setIsConnecting(false);
                            setIsDisconnected(false);
                        } catch (e) {
                            console.error('[Pocket AI] Session key unwrap 실패:', e);
                            sessionKeyRef.current = sharedSecretRef.current;
                            keyReadyRef.current.resolve(); // 실패해도 대기 해제
                            loadMessageHistoryRef.current(sharedSecretRef.current!, { silent: hasWarmCacheRef.current });
                            setIsConnecting(false);
                            setIsDisconnected(false);
                        }
                    });

                    setTimeout(() => {
                        if (!sessionKeyRef.current && sharedSecretRef.current) {
                            sessionKeyRef.current = sharedSecretRef.current;
                            keyReadyRef.current.resolve(); // 타임아웃 fallback도 대기 해제
                            loadMessageHistoryRef.current(sharedSecretRef.current!, { silent: hasWarmCacheRef.current });
                            setIsConnecting(false);
                            setIsDisconnected(false);
                        }
                    }, 5000);
                } catch (e) {
                    console.error('E2E Setup Failed', e);
                    setSystemError('E2E 보안 채널 설정에 실패했습니다. 페이지를 새로고침 해주세요.');
                    setIsConnecting(false);
                }
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            socket.once('join-error', (err: any) => {
                console.error('Failed to join session', err);
                setSystemError(`세션 연결 실패: ${err.error ?? '세션이 오프라인 상태입니다.'}`);
                setIsConnecting(false);
            });
        } catch (err) {
            console.error(err);
        }
    }, [sessionId]);

    // ref 동기화: connect 이벤트에서 항상 최신 initConnection 사용
    initConnectionRef.current = initConnection;

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
            initConnectionRef.current(socket);
        });

        socket.on('disconnect', (reason) => {
            console.warn('Socket disconnected:', reason);
            setIsConnecting(false);
            sharedSecretRef.current = null;
            sessionKeyRef.current = null;
            historyLoadedRef.current = false; // 재연결 시 새 메시지 다시 로드
            keyReadyRef.current.resolve(); // 대기 중인 update 핸들러 unblock (key 없이 처리 → 무시됨)
            // 1.5초 grace period: 빠른 재연결 시 오버레이 표시 안 함
            disconnectTimerRef.current = setTimeout(() => {
                setIsDisconnected(true);
            }, 1500);
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        socket.on('update', async (payload: any) => {
            // session-key 처리 전에 update가 먼저 도착하는 레이스 컨디션 방지
            if (payload.sender === 'cli' && !sessionKeyRef.current) {
                await keyReadyRef.current.promise;
            }
            const decryptKey = sessionKeyRef.current || sharedSecretRef.current;
            if (payload.sender === 'cli' && payload.body && decryptKey) {
                try {
                    const decryptedJson = await decrypt(payload.body, decryptKey);
                    const msg = JSON.parse(decryptedJson);

                    if (msg.t === 'session-event') {
                        if (msg.event === 'stopped-typing') {
                            setIsAiThinking(false);
                        }
                        if (msg.event === 'history-start') {
                            cliHistoryActiveRef.current = true;
                            historyLoadedRef.current = true; // 서버 fetch 방지
                            setMessages([]);
                            setIsLoadingHistory(true);
                        }
                        if (msg.event === 'history-end') {
                            cliHistoryActiveRef.current = false;
                            setIsLoadingHistory(false);
                        }
                        if (msg.event === 'thinking-start') {
                            setIsAiThinking(true);
                        }
                        if (msg.event === 'usage' && msg.data) {
                            const tokens = (msg.data as { outputTokens?: number }).outputTokens;
                            if (tokens) setThinkingTokens(tokens);
                        }
                    }

                    if (msg.t === 'text') {
                        const isHistory = Boolean(msg._history);
                        // 실시간 응답 수신 시 타이머 리셋 (현재 작업 경과 시간 표시)
                        if (!isHistory) setThinkingSeconds(0);
                        setMessages(prev => [...prev, {
                            kind: 'text',
                            id: crypto.randomUUID(),
                            role: (isHistory && msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                            content: msg.text,
                            timestamp: (isHistory && msg._ts) ? msg._ts : Date.now(),
                        }]);
                    }

                    if (msg.t === 'tool-call') {
                        const isHistory = Boolean(msg._history);
                        if (!isHistory) setThinkingSeconds(0);
                        setMessages(prev => [...prev, {
                            kind: 'tool',
                            id: msg.id,
                            name: msg.name,
                            args: msg.arguments,
                            status: 'running' as const,
                            ...(isHistory ? {} : { startTime: Date.now() }),
                        }]);
                    }

                    if (msg.t === 'tool-result') {
                        if (!msg._history) setThinkingSeconds(0);
                        setMessages(prev => prev.map(m =>
                            m.kind === 'tool' && m.id === msg.id
                                ? { ...m, output: msg.result, status: (msg.error ? 'error' : 'done') as 'error' | 'done', error: msg.error }
                                : m
                        ));
                    }

                    // Claude JSON 스트리밍: 권한 프롬프트 / 선택지 요청
                    if (msg.t === 'input-request') {
                        setIsAiThinking(false);
                        setMessages(prev => [...prev, {
                            kind: 'permission' as const,
                            id: msg.requestId,
                            requestType: msg.requestType as 'permission' | 'selection',
                            toolName: msg.toolName,
                            toolInput: msg.toolInput,
                            message: msg.message,
                            options: msg.options,
                            status: 'pending' as const,
                        }]);
                    }
                } catch (e) {
                    console.error('Failed to decrypt CLI message', e);
                }
            }
        });

        // 슬래시 명령어 수신
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        socket.on('slash-commands', (payload: any) => {
            if (Array.isArray(payload?.commands)) {
                setSlashCommands(payload.commands);
                try {
                    localStorage.setItem(`pocket_ai_slash_${sessionId}`, JSON.stringify(payload.commands));
                } catch { /* 저장 실패 무시 */ }
            }
        });

        return () => {
            socket.disconnect();
            if (disconnectTimerRef.current) {
                clearTimeout(disconnectTimerRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    // 세션 변경 시 상태 초기화
    useEffect(() => {
        const cached = sessionUiCache.get(sessionId);
        if (cached) {
            setMessages(cached.messages);
            setSessionMeta(cached.sessionMeta);
            hasWarmCacheRef.current = cached.messages.length > 0;
        } else {
            setMessages([]);
            setSessionMeta({});
            hasWarmCacheRef.current = false;
        }
        historyLoadedRef.current = false;
        lastSeqRef.current = undefined;
        sessionKeyRef.current = null;
    }, [sessionId]);

    useEffect(() => {
        sessionUiCache.set(sessionId, { messages, sessionMeta });
    }, [messages, sessionId, sessionMeta]);

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
        // 슬래시 드롭다운이 열려 있으면 키보드 이벤트는 드롭다운이 처리
        if (showSlashDropdown) return;

        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
        }
    };


    // 권한 프롬프트 응답 (허용/거부) 전송
    const handlePermissionResponse = useCallback(async (requestId: string, approved: boolean) => {
        const encryptKey = sessionKeyRef.current || sharedSecretRef.current;
        if (!socketRef.current || !encryptKey || isDisconnected) return;

        // 메시지 목록에서 해당 권한 요청 상태 업데이트
        setMessages(prev => prev.map(m =>
            m.kind === 'permission' && m.id === requestId
                ? { ...m, status: (approved ? 'approved' : 'denied') as 'approved' | 'denied' }
                : m
        ));

        try {
            const response = { t: 'input-response', requestId, approved };
            const encryptedBody = await encrypt(JSON.stringify(response), encryptKey);
            socketRef.current.emit('update', {
                sessionId, sender: 'pwa', body: encryptedBody
            });
            if (approved) setIsAiThinking(true);
        } catch (err) {
            console.error('Failed to send permission response', err);
        }
    }, [isDisconnected, sessionId]);

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

    const MODEL_IDS: Record<string, string> = {
        adaptive: 'claude-sonnet-4-5',
        sonnet: 'claude-sonnet-4-6',
        opus: 'claude-opus-4-6',
    };

    const handleSettingsChange = useCallback(async (newSettings: ChatSettings) => {
        const encryptKey = sessionKeyRef.current || sharedSecretRef.current;
        setChatSettings(newSettings);

        if (!socketRef.current || !encryptKey || isDisconnected) return;

        const prev = chatSettings;

        // 퍼미션 모드 변경
        if (newSettings.permissionMode !== prev.permissionMode) {
            try {
                const cmd = JSON.stringify({ t: 'control-command', command: 'set-permission-mode', value: newSettings.permissionMode });
                const encrypted = await encrypt(cmd, encryptKey);
                socketRef.current.emit('update', { sessionId, sender: 'pwa', body: encrypted });
            } catch (err) {
                console.error('Failed to send permission mode command', err);
            }
        }

        // 커스텀 worker 변경
        if (JSON.stringify(newSettings.customWorkers) !== JSON.stringify(prev.customWorkers)) {
            try {
                const cmd = JSON.stringify({ t: 'control-command', command: 'set-workers', workers: newSettings.customWorkers });
                const encrypted = await encrypt(cmd, encryptKey);
                socketRef.current.emit('update', { sessionId, sender: 'pwa', body: encrypted });
            } catch (err) {
                console.error('Failed to send workers command', err);
            }
        }

        // 빌트인 worker 토글 변경
        if (JSON.stringify(newSettings.builtinWorkers) !== JSON.stringify(prev.builtinWorkers)) {
            try {
                const cmd = JSON.stringify({ t: 'control-command', command: 'set-builtin-workers', workers: newSettings.builtinWorkers });
                const encrypted = await encrypt(cmd, encryptKey);
                socketRef.current.emit('update', { sessionId, sender: 'pwa', body: encrypted });
            } catch (err) {
                console.error('Failed to send builtin workers command', err);
            }
        }

        // 모델 변경
        if (newSettings.model !== prev.model) {
            const modelId = MODEL_IDS[newSettings.model] ?? '';
            if (modelId) {
                try {
                    const cmd = JSON.stringify({ t: 'control-command', command: 'set-model', value: modelId });
                    const encrypted = await encrypt(cmd, encryptKey);
                    socketRef.current.emit('update', { sessionId, sender: 'pwa', body: encrypted });
                } catch (err) {
                    console.error('Failed to send model command', err);
                }
            }
        }
    }, [chatSettings, isDisconnected, sessionId]);

    const handleInterrupt = useCallback(async () => {
        const encryptKey = sessionKeyRef.current || sharedSecretRef.current;
        if (!socketRef.current || !encryptKey || isDisconnected) return;
        try {
            const msgStr = JSON.stringify({ t: 'session-event', event: 'interrupt' });
            const encryptedBody = await encrypt(msgStr, encryptKey);
            socketRef.current.emit('update', { sessionId, sender: 'pwa', body: encryptedBody });
            setIsAiThinking(false);
        } catch (err) {
            console.error('Failed to send interrupt', err);
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
        setThinkingSeconds(0);
        setThinkingTokens(0);
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
                                {sessionMeta.sessionName
                                    ? sessionMeta.sessionName
                                    : sessionMeta.engine
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

                {/* 헤더 우측: 상태 뱃지 + 버튼들 */}
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
                    {onRenameSession && (
                        <button
                            onClick={() => { setRenameValue(sessionMeta.sessionName || sessionMeta.hostname || ''); setIsRenaming(true); }}
                            className="p-2 text-gray-400 hover:text-white bg-gray-800/50 hover:bg-gray-700 rounded-lg transition-colors border border-gray-700/50"
                            title="세션 이름 변경"
                        >
                            <Pencil size={15} />
                        </button>
                    )}
                    {onDeleteSession && (
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="p-2 text-gray-400 hover:text-red-400 bg-gray-800/50 hover:bg-red-500/10 rounded-lg transition-colors border border-gray-700/50"
                            title="세션 삭제"
                        >
                            <Trash2 size={15} />
                        </button>
                    )}
                </div>
            </header>

            {/* 시스템 에러 배너 */}
            {systemError && (
                <div className="flex-none bg-red-900/40 border-b border-red-800/60 px-4 py-2 flex items-center gap-2 z-20">
                    <span className="text-red-300 text-xs font-medium flex-1">{systemError}</span>
                    <button
                        onClick={() => setSystemError(null)}
                        className="text-red-400 hover:text-red-200 text-lg leading-none flex-shrink-0"
                        aria-label="닫기"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Main chat area */}
            <main className="flex-1 relative w-full min-h-0 bg-gray-950 flex flex-col">
                {chatSettingsTab !== null && (
                    <ChatSettingsPanel
                        settings={chatSettings}
                        onSettingsChange={handleSettingsChange}
                        onClose={() => setChatSettingsTab(null)}
                        isClaudeEngine={sessionMeta.engine === 'claude' || !sessionMeta.engine}
                        activeTab={chatSettingsTab}
                        onTabChange={(tab) => setChatSettingsTab(tab)}
                    />
                )}

                {/* 이름 변경 모달 */}
                {isRenaming && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 w-full max-w-xs mx-4 shadow-2xl">
                            <h3 className="text-sm font-semibold text-white mb-3">세션 이름 변경</h3>
                            <input
                                type="text"
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        const trimmed = renameValue.trim();
                                        if (trimmed) { onRenameSession?.(trimmed); }
                                        setIsRenaming(false);
                                    }
                                    if (e.key === 'Escape') setIsRenaming(false);
                                }}
                                autoFocus
                                className="w-full text-sm bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500/60"
                            />
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={() => { const trimmed = renameValue.trim(); if (trimmed) { onRenameSession?.(trimmed); } setIsRenaming(false); }}
                                    className="flex-1 text-sm py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                                >
                                    저장
                                </button>
                                <button
                                    onClick={() => setIsRenaming(false)}
                                    className="flex-1 text-sm py-2 rounded-xl border border-gray-700 text-gray-400 hover:text-white transition-colors"
                                >
                                    취소
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 세션 삭제 확인 */}
                {showDeleteConfirm && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 w-full max-w-xs mx-4 shadow-2xl">
                            <h3 className="text-sm font-semibold text-white mb-1">세션 삭제</h3>
                            <p className="text-xs text-gray-400 mb-4">이 세션을 삭제하시겠습니까?</p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="flex-1 text-sm py-2 rounded-xl border border-gray-700 text-gray-400 hover:text-white transition-colors"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={() => { setShowDeleteConfirm(false); onDeleteSession?.(); onBack(); }}
                                    className="flex-1 text-sm py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors"
                                >
                                    삭제
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 연결 중 오버레이 */}
                {(isConnecting || isLoadingHistory) && !isDisconnected && messages.length === 0 && (
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

                <MessageList messages={messages} isAiThinking={isAiThinking} onOptionSelect={handleOptionSelect} onPermissionResponse={handlePermissionResponse} thinkingSeconds={thinkingSeconds} thinkingTokens={thinkingTokens} />

                {/* 입력 영역 */}
                <div className="flex-none bg-gray-950 w-full border-t border-gray-800/60 relative">

                    {/* 슬래시 명령어 드롭다운 */}
                    {slashCommands.length > 0 && (
                        <SlashCommandDropdown
                            commands={slashCommands}
                            inputValue={inputValue}
                            onSelect={(cmd) => {
                                setInputValue(cmd + ' ');
                                setShowSlashDropdown(false);
                                textareaRef.current?.focus();
                            }}
                            onClose={() => setShowSlashDropdown(false)}
                            visible={showSlashDropdown}
                        />
                    )}

                    {/* 입력창 — Claude Code 스타일 2행 컨테이너 */}
                    <div className="max-w-3xl mx-auto w-full px-3 pt-2.5" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                        <div className="bg-gray-900 border border-gray-700/60 rounded-2xl shadow-xl transition-all focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/30 flex flex-col">
                            {/* 1행: 텍스트 입력 */}
                            <textarea
                                ref={textareaRef}
                                rows={1}
                                value={inputValue}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setInputValue(val);
                                    adjustTextareaHeight();
                                    if (val.startsWith('/') && slashCommands.length > 0) {
                                        setShowSlashDropdown(true);
                                    } else {
                                        setShowSlashDropdown(false);
                                    }
                                }}
                                onKeyDown={handleKeyDown}
                                placeholder={t('inputPlaceholder')}
                                className="bg-transparent text-gray-100 placeholder-gray-500 outline-none resize-none text-[16px] leading-relaxed px-4 pt-3 pb-2 min-h-[26px] max-h-40 overflow-y-auto w-full"
                                autoComplete="off"
                                style={{ height: 'auto' }}
                            />
                            {/* 2행: 툴바 */}
                            <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-gray-800/60">
                                {/* 왼쪽: 설정 아이콘 + 중단 버튼 or 힌트 */}
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setChatSettingsTab(prev => prev === 'session' ? null : 'session')}
                                        className={`p-1.5 rounded-lg transition-colors ${chatSettingsTab === 'session' ? 'text-blue-400 bg-blue-500/10' : 'text-gray-600 hover:text-gray-300 hover:bg-gray-800/50'}`}
                                        title="Permission & Model"
                                    >
                                        <SlidersHorizontal size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setChatSettingsTab(prev => prev === 'workers' ? null : 'workers')}
                                        className={`p-1.5 rounded-lg transition-colors ${chatSettingsTab === 'workers' ? 'text-blue-400 bg-blue-500/10' : 'text-gray-600 hover:text-gray-300 hover:bg-gray-800/50'}`}
                                        title="Orchestration Workers"
                                    >
                                        <Network size={14} />
                                    </button>
                                    {isAiThinking ? (
                                        <button
                                            type="button"
                                            onClick={handleInterrupt}
                                            className="ml-1 flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-full transition-colors"
                                        >
                                            <span className="w-2 h-2 rounded-sm bg-red-400 inline-block flex-shrink-0" />
                                            {t('stopGeneration')}
                                            {thinkingSeconds > 0 && <span className="text-red-400/60 ml-0.5">{thinkingSeconds}s</span>}
                                        </button>
                                    ) : (
                                        <p className="ml-1 text-[10px] text-gray-700 font-mono select-none">
                                            <kbd>Shift+Enter</kbd> 줄바꿈
                                        </p>
                                    )}
                                </div>
                                {/* 오른쪽: 전송 버튼 */}
                                <button
                                    type="button"
                                    onClick={() => handleSend()}
                                    disabled={!inputValue.trim() || isDisconnected}
                                    className="flex-shrink-0 w-8 h-8 flex justify-center items-center bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-full transition-all active:scale-90"
                                >
                                    <ArrowUp size={16} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Loader2, WifiOff, ClipboardPaste } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { generateECDHKeyPair, deriveSharedSecret, importPublicKey, exportPublicKey, encrypt, decrypt } from '@pocket-ai/wire';
import 'xterm/css/xterm.css';

interface TerminalChatProps {
    sessionId: string;
    onBack: () => void;
}

export function TerminalChat({ sessionId, onBack }: TerminalChatProps) {
    const [isConnecting, setIsConnecting] = useState(true);
    const [isDisconnected, setIsDisconnected] = useState(false);

    const terminalRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const termInstance = useRef<any>(null);
    const sharedSecretRef = useRef<CryptoKey | null>(null);
    const socketRef = useRef<Socket | null>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initConnection = useCallback(async (term: any, socket: Socket) => {
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

                    setIsConnecting(false);
                    setIsDisconnected(false);
                    term.writeln('\r\n\x1b[32m[Pocket AI] 🔒 End-to-End Encrypted connection established.\x1b[0m\r\n');
                } catch (e) {
                    console.error('E2E Setup Failed', e);
                    term.writeln('\r\n\x1b[31m[Pocket AI] E2E Setup Failed.\x1b[0m\r\n');
                }
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            socket.once('join-error', (err: any) => {
                console.error('Failed to join session', err);
                term.writeln(`\r\n\x1b[31m[Pocket AI] Failed to join session: ${err.error}\x1b[0m\r\n`);
                setIsConnecting(false);
            });
        } catch (err) {
            console.error(err);
        }
    }, [sessionId]);

    useEffect(() => {
        if (!terminalRef.current) return;

        let socket: Socket;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let term: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fitAddon: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let webLinksAddon: any;

        const setupTerminal = async () => {
            const { Terminal } = await import('xterm');
            const { FitAddon } = await import('xterm-addon-fit');

            try {
                const WebLinksAddonModule = await import('xterm-addon-web-links');
                webLinksAddon = new WebLinksAddonModule.WebLinksAddon();
            } catch {
                // Ignore if not installed
            }

            const isMobile = window.innerWidth < 768;

            term = new Terminal({
                cursorBlink: true,
                theme: {
                    background: '#030712', // tailwind gray-950
                    foreground: '#f3f4f6', // tailwind gray-100
                    selectionBackground: '#1e40af', // blue-800
                },
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                fontSize: isMobile ? 12 : 14,
                lineHeight: 1.2,
                scrollback: 5000,
                macOptionIsMeta: true,
                allowTransparency: true,
            });

            fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            if (webLinksAddon) {
                term.loadAddon(webLinksAddon);
            }

            if (terminalRef.current) {
                term.open(terminalRef.current);
                fitAddon.fit();
            }

            termInstance.current = term;

            const handleResize = () => {
                if (termInstance.current && fitAddon) {
                    fitAddon.fit();
                }
            };
            window.addEventListener('resize', handleResize);

            // Connect Socket
            const SERVER_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            socket = io(SERVER_URL, {
                reconnectionDelayMax: 5000,
                reconnectionAttempts: Infinity
            });
            socketRef.current = socket;

            socket.on('connect', () => {
                setIsDisconnected(false);
                setIsConnecting(true);
                initConnection(term, socket);
            });

            socket.on('disconnect', (reason) => {
                console.warn('Socket disconnected:', reason);
                setIsDisconnected(true);
                setIsConnecting(false);
                sharedSecretRef.current = null; // Invalidate current session key
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            socket.on('update', async (payload: any) => {
                if (payload.sender === 'cli' && payload.body && sharedSecretRef.current) {
                    try {
                        const decryptedJson = await decrypt(payload.body, sharedSecretRef.current);
                        const msg = JSON.parse(decryptedJson);

                        if (msg.t === 'text') {
                            term.write(msg.text);
                        }
                    } catch (e) {
                        console.error('Failed to decrypt CLI message', e);
                    }
                }
            });

            // Handle user typing
            term.onData(async (data: string) => {
                if (!sharedSecretRef.current || isDisconnected) return;
                try {
                    const msgStr = JSON.stringify({ t: 'text', text: data });
                    const encryptedBody = await encrypt(msgStr, sharedSecretRef.current);

                    socket.emit('update', {
                        t: 'encrypted',
                        sessionId,
                        sender: 'pwa',
                        body: encryptedBody
                    });
                } catch (e) {
                    console.error('Failed to encrypt outgoing message', e);
                }
            });
        };

        setupTerminal();

        return () => {
            if (socket) socket.disconnect();
            if (term) term.dispose();
            window.removeEventListener('resize', () => { });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, initConnection]);

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text && socketRef.current && sharedSecretRef.current && !isDisconnected && !isConnecting) {
                const msgStr = JSON.stringify({ t: 'text', text: text });
                const encryptedBody = await encrypt(msgStr, sharedSecretRef.current);
                socketRef.current.emit('update', {
                    t: 'encrypted',
                    sessionId,
                    sender: 'pwa',
                    body: encryptedBody
                });

                termInstance.current?.focus();
            }
        } catch (e) {
            console.error('Failed to read clipboard', e);
        }
    };

    return (
        <div className="flex flex-col h-[100dvh] bg-gray-950 font-sans text-gray-100 overflow-hidden">
            <header className="flex-none flex items-center justify-between p-3 border-b border-gray-800 bg-gray-900/80 backdrop-blur-md z-20">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h2 className="font-semibold text-sm md:text-base flex items-center gap-2 text-white">
                            <span className={`w-2 h-2 rounded-full ${isDisconnected ? 'bg-red-500' : isConnecting ? 'bg-yellow-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`}></span>
                            <span className="font-mono">{sessionId.split('-')[0]}</span>
                            <span className="hidden sm:inline text-gray-400 font-normal">
                                ({isDisconnected ? '연결 끊김' : isConnecting ? '연결 중' : '보안 연결됨'})
                            </span>
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {!isDisconnected && !isConnecting && (
                        <button
                            onClick={handlePaste}
                            className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors border border-gray-700 hover:border-gray-600"
                            title="클립보드 붙여넣기"
                        >
                            <ClipboardPaste size={14} />
                            <span className="hidden sm:inline">붙여넣기</span>
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-1 relative w-full h-full bg-gray-950 flex flex-col">
                {isConnecting && !isDisconnected && (
                    <div className="absolute inset-0 z-10 bg-gray-950/80 flex flex-col items-center justify-center text-gray-300 gap-4 backdrop-blur-sm">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        <div className="text-center">
                            <p className="font-medium text-lg">보안 연결 설정 중...</p>
                            <p className="text-sm text-gray-500 mt-1">AES-256-GCM 종단간 암호화 키 교환 진행</p>
                        </div>
                    </div>
                )}

                {isDisconnected && (
                    <div className="absolute inset-0 z-10 bg-gray-950/90 flex flex-col items-center justify-center text-gray-300 gap-5 backdrop-blur-md">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 shadow-lg">
                            <WifiOff className="w-8 h-8 text-red-400" />
                        </div>
                        <div className="text-center max-w-sm px-4">
                            <p className="font-semibold text-xl text-white">서버 연결이 끊어졌습니다</p>
                            <p className="text-gray-400 mt-2 text-sm leading-relaxed">네트워크 상태를 확인해주세요. 연결이 복구되면 자동으로 보안 세션을 다시 수립합니다.</p>
                        </div>
                        <Loader2 className="w-5 h-5 animate-spin text-gray-500 mt-4" />
                    </div>
                )}

                <div className="flex-1 w-full relative">
                    <div
                        ref={terminalRef}
                        className="absolute inset-x-0 inset-y-0 terminal-container custom-scrollbar"
                        style={{ padding: '8px' }}
                    />
                </div>
            </main>
        </div>
    );
}

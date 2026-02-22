'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { generateECDHKeyPair, deriveSharedSecret, importPublicKey, exportPublicKey, encrypt, decrypt } from '@pocket-ai/wire';
import 'xterm/css/xterm.css';

interface TerminalChatProps {
    sessionId: string;
    onBack: () => void;
}

export function TerminalChat({ sessionId, onBack }: TerminalChatProps) {
    const [isConnecting, setIsConnecting] = useState(true);
    const terminalRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const termInstance = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fitAddonRef = useRef<any>(null);

    const sharedSecretRef = useRef<CryptoKey | null>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        if (!terminalRef.current) return;

        let socket: Socket;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let term: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fitAddon: any;

        const initTerminal = async () => {
            const { Terminal } = await import('xterm');
            const { FitAddon } = await import('xterm-addon-fit');

            term = new Terminal({
                cursorBlink: true,
                theme: {
                    background: '#030712', // tailwind gray-950
                    foreground: '#f3f4f6', // tailwind gray-100
                },
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            });
            fitAddon = new FitAddon();
            term.loadAddon(fitAddon);

            if (terminalRef.current) {
                term.open(terminalRef.current);
                fitAddon.fit();
            }

            termInstance.current = term;
            fitAddonRef.current = fitAddon;

            const handleResize = () => fitAddon.fit();
            window.addEventListener('resize', handleResize);

            // Connect Socket
            const SERVER_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            socket = io(SERVER_URL);
            socketRef.current = socket;

            const token = localStorage.getItem('pocket_ai_token');
            if (!token) return;

            // 1. Generate PWA ECDH Key Pair
            const keyPair = await generateECDHKeyPair();
            const pubBase64 = await exportPublicKey(keyPair.publicKey);

            socket.on('connect', () => {
                socket.emit('session-join', { sessionId, token });
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            socket.on('join-success', async (data: any) => {
                try {
                    // 2. Derive Shared Secret using CLI's public key
                    const cliPubKey = await importPublicKey(data.publicKey);
                    sharedSecretRef.current = await deriveSharedSecret(keyPair.privateKey, cliPubKey);

                    // 3. Send PWA public key to CLI via key-exchange event
                    socket.emit('key-exchange', {
                        sessionId,
                        publicKey: pubBase64,
                        sender: 'pwa'
                    });

                    setIsConnecting(false);
                    term.writeln('\x1b[32m[Pocket AI] End-to-End Encrypted connection established.\x1b[0m');
                } catch (e) {
                    console.error('E2E Setup Failed', e);
                    term.writeln('\x1b[31m[Pocket AI] E2E Setup Failed.\x1b[0m');
                }
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            socket.on('join-error', (err: any) => {
                console.error('Failed to join session', err);
                term.writeln(`\x1b[31m[Pocket AI] Failed to join session: ${err.error}\x1b[0m`);
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
                if (!sharedSecretRef.current) return;
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

        initTerminal();

        return () => {
            if (socket) socket.disconnect();
            if (term) term.dispose();
            // clean up resize listener if needed
        };
    }, [sessionId]);

    return (
        <div className="flex flex-col h-screen bg-gray-950 font-sans text-gray-100">
            <header className="flex items-center gap-4 p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-md">
                <button onClick={onBack} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className="font-semibold text-lg flex items-center gap-2 text-white">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Session: {sessionId}
                    </h2>
                    <p className="text-xs text-gray-400">E2E Encrypted Terminal</p>
                </div>
            </header>

            <main className="flex-1 relative overflow-hidden p-2">
                {isConnecting && (
                    <div className="absolute inset-0 z-10 bg-gray-950/80 flex flex-col items-center justify-center text-gray-500 gap-4 backdrop-blur-sm">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        <p>Establishing E2E Secure Connection...</p>
                    </div>
                )}
                <div ref={terminalRef} className="w-full h-full" />
            </main>
        </div>
    );
}

import { Command } from 'commander';
import os from 'os';
import { generateECDHKeyPair, exportPublicKey, importPublicKey, deriveSharedSecret, encrypt, decrypt } from '@pocket-ai/wire';
import { getToken } from '../config.js';
import { connectToServer, registerSession } from '../server/connection.js';
import { SessionWatcher, getSessionDisplayName, isValidEngine } from '../session-manager.js';
import { ClaudeOutputParser } from '../utils/output-parser.js';
/**
 * AI CLI 세션 시작 (Happy 스타일 심플 래퍼)
 */
export async function startSession(command = 'claude', options = {}) {
    const token = getToken();
    if (!token) {
        console.error('로그인이 필요합니다. pocket-ai login을 먼저 실행하세요.');
        process.exit(1);
    }
    console.log(`Pocket AI - ${command} 세션을 시작합니다...`);
    // 1. Generate ECDH key pair
    const keyPair = await generateECDHKeyPair();
    const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
    // 2. Register session with server
    let sessionId;
    try {
        sessionId = await registerSession(publicKeyBase64, {
            hostname: os.hostname(),
            engine: command,
        });
        console.log(`세션 등록 완료: ${sessionId.slice(0, 8)}...`);
    }
    catch (err) {
        console.error(`세션 등록 실패: ${err.message}`);
        process.exit(1);
    }
    // 3. Dynamically import node-pty (native module)
    let pty;
    try {
        pty = await import('node-pty');
    }
    catch {
        console.error('node-pty를 로드할 수 없습니다. npm install 후 다시 시도하세요.');
        process.exit(1);
    }
    // 4. Spawn AI CLI process
    const shell = pty.default.spawn(command, [], {
        name: 'xterm-256color',
        cols: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
        cwd: process.cwd(),
        env: { ...process.env },
    });
    // 5. Local mode: pipe CLI output to terminal
    let socket = null;
    let sharedSecret = null;
    const parser = new ClaudeOutputParser();
    shell.onData((data) => {
        process.stdout.write(data); // 로컬 터미널은 raw ANSI 그대로
        // Also relay to remote clients if connected and key is derived
        if (sharedSecret && socket) {
            const events = parser.feed(data);
            for (const event of events) {
                encrypt(JSON.stringify(event), sharedSecret)
                    .then((encrypted) => {
                    socket.emit('update', {
                        sessionId,
                        sender: 'cli',
                        body: encrypted,
                    });
                })
                    .catch(() => { }); // Non-critical: remote relay failure shouldn't break local
            }
        }
    });
    // Handle local keyboard input
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on('data', (data) => {
        shell.write(data.toString());
    });
    // Handle terminal resize
    process.stdout.on('resize', () => {
        shell.resize(process.stdout.columns || 80, process.stdout.rows || 24);
    });
    // Handle CLI process exit
    shell.onExit(({ exitCode }) => {
        console.log(`\nAI CLI 프로세스가 종료되었습니다 (code: ${exitCode})`);
        // flush remaining parser state
        if (sharedSecret && socket) {
            for (const event of parser.flush()) {
                encrypt(JSON.stringify(event), sharedSecret)
                    .then((encrypted) => {
                    socket.emit('update', { sessionId, sender: 'cli', body: encrypted });
                })
                    .catch(() => { });
            }
        }
        if (socket)
            socket.disconnect();
        process.exit(exitCode);
    });
    // 6. Connect to relay server
    if (options.remote !== false) {
        const sessionMetadata = { hostname: os.hostname(), engine: command };
        socket = connectToServer({
            sessionId,
            publicKey: publicKeyBase64,
            metadata: sessionMetadata,
            onSessionIdUpdate: (newSessionId) => {
                sessionId = newSessionId;
                console.log(`[Pocket AI] 세션 재등록 완료: ${newSessionId.slice(0, 8)}...`);
            },
            onAuthSuccess: (data) => {
                console.log(`서버 연결 완료 (세션: ${data.sessionId.slice(0, 8)}...)`);
                console.log('원격 접속 대기 중... (PWA 또는 다른 머신에서 접속 가능)\n');
            },
            onAuthError: (data) => {
                console.error(`서버 인증 실패: ${data.error}`);
            },
            onKeyExchange: async (data) => {
                try {
                    // PWA sent its public key - derive shared secret
                    const peerPublicKey = await importPublicKey(data.publicKey);
                    sharedSecret = await deriveSharedSecret(keyPair.privateKey, peerPublicKey);
                }
                catch (err) {
                    console.error('[Pocket AI] 키교환 실패:', err);
                }
            },
            onUpdate: async (data) => {
                if (data.sender === 'pwa' && data.body && sharedSecret) {
                    try {
                        const decrypted = await decrypt(data.body, sharedSecret);
                        const msg = JSON.parse(decrypted);
                        if (msg.t === 'text') {
                            shell.write(msg.text);
                        }
                    }
                    catch (err) {
                        console.error('[Pocket AI] 메시지 복호화 실패');
                    }
                }
            },
            onDisconnect: () => {
                console.log('[Pocket AI] 서버 연결이 끊어졌습니다. 재연결 중...');
            },
        });
    }
    // 7. Happy 스타일 폴더 변경 감지 (선택적 기능)
    const watcher = new SessionWatcher(command);
    watcher.onCwdChange((oldKey, newKey) => {
        console.log(`\n[Pocket AI] 폴더 변경 감지: ${getSessionDisplayName(oldKey)} → ${getSessionDisplayName(newKey)}`);
        console.log('현재 세션을 계속 사용합니다. 새 세션을 시작하려면 Ctrl+C 후 pocket-ai를 다시 실행하세요.\n');
        // TODO: 데몬 모드에서는 자동으로 새 세션 시작
    });
    watcher.start();
    // 8. CLI 내부 명령어 처리 (Happy 스타일 /switch)
    let commandBuffer = '';
    const originalStdinListener = process.stdin.listeners('data')[0];
    process.stdin.removeAllListeners('data');
    process.stdin.on('data', (data) => {
        const input = data.toString();
        // /switch 명령어 감지
        if (input.startsWith('/switch ')) {
            const newEngine = input.slice(8).trim();
            if (isValidEngine(newEngine)) {
                console.log(`\n[Pocket AI] AI 엔진을 ${newEngine}으로 전환합니다...`);
                // TODO: 현재 세션 종료 후 새 엔진으로 재시작
                console.log('(구현 예정: 현재는 수동으로 Ctrl+C 후 pocket-ai start ' + newEngine + ' 실행)\n');
            }
            else {
                console.log(`\n[Pocket AI] 지원하지 않는 엔진입니다: ${newEngine}`);
                console.log('지원 엔진: claude, codex, gemini\n');
            }
            return;
        }
        // 일반 입력은 AI CLI로 전달
        shell.write(input);
    });
    // Graceful shutdown
    const cleanup = () => {
        watcher.stop();
        shell.kill();
        if (socket)
            socket.disconnect();
        process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}
export const startCommand = new Command('start')
    .description('AI CLI 세션 시작 (고급: 특정 AI 엔진 지정)')
    .argument('[command]', 'AI CLI 명령어', 'claude')
    .option('--no-remote', '원격 접속 비활성화 (로컬 전용)')
    .action(startSession);

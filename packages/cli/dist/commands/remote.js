import { Command } from 'commander';
import { io } from 'socket.io-client';
import { generateECDHKeyPair, exportPublicKey, importPublicKey, deriveSharedSecret, encrypt, decrypt } from '@pocket-ai/wire';
import { getToken, getServerUrl } from '../config.js';
import { fetchSessions } from '../server/connection.js';
export const remoteCommand = new Command('remote')
    .description('원격 세션 관리 및 접속');
// pocket-ai remote list
remoteCommand
    .command('list')
    .description('활성 세션 목록 조회')
    .action(async () => {
    const token = getToken();
    if (!token) {
        console.error('로그인이 필요합니다. pocket-ai login을 먼저 실행하세요.');
        process.exit(1);
    }
    try {
        const sessions = await fetchSessions();
        if (sessions.length === 0) {
            console.log('활성화된 세션이 없습니다.');
            console.log('PC에서 pocket-ai start를 실행하세요.');
            return;
        }
        console.log(`\n활성 세션 (${sessions.length}개):\n`);
        for (const s of sessions) {
            const hostname = s.metadata?.hostname || 'Unknown';
            const engine = s.metadata?.engine || 'unknown';
            console.log(`  ${s.sessionId.slice(0, 8)}...  ${hostname}  (${engine})  [${s.status}]`);
        }
        console.log(`\n접속: pocket-ai remote connect <session-id>\n`);
    }
    catch (err) {
        console.error(`세션 목록 조회 실패: ${err.message}`);
        process.exit(1);
    }
});
// pocket-ai remote connect <session-id>
remoteCommand
    .command('connect <sessionId>')
    .description('원격 세션에 접속')
    .action(async (sessionId) => {
    const token = getToken();
    if (!token) {
        console.error('로그인이 필요합니다. pocket-ai login을 먼저 실행하세요.');
        process.exit(1);
    }
    console.log(`세션 ${sessionId.slice(0, 8)}...에 접속 중...`);
    // 1. Generate ECDH key pair
    const keyPair = await generateECDHKeyPair();
    const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
    // 2. Connect via Socket.IO
    const serverUrl = getServerUrl();
    const socket = io(serverUrl, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
    });
    let sharedSecret = null;
    socket.on('connect', () => {
        socket.emit('session-join', { sessionId, token });
    });
    socket.on('join-success', async (data) => {
        try {
            // Derive shared secret from CLI's public key
            const cliPublicKey = await importPublicKey(data.publicKey);
            sharedSecret = await deriveSharedSecret(keyPair.privateKey, cliPublicKey);
            // Send our public key to CLI
            socket.emit('key-exchange', {
                sessionId,
                publicKey: publicKeyBase64,
                sender: 'pwa', // Using 'pwa' sender type for remote clients too
            });
            console.log('E2E 암호화 연결 설정 완료!');
            console.log('입력을 시작하세요. (Ctrl+C로 종료)\n');
        }
        catch (err) {
            console.error('키교환 실패:', err);
            process.exit(1);
        }
    });
    socket.on('join-error', (data) => {
        console.error(`세션 접속 실패: ${data.error}`);
        process.exit(1);
    });
    // Receive encrypted messages from CLI
    socket.on('update', async (data) => {
        if (data.sender === 'cli' && data.body && sharedSecret) {
            try {
                const decrypted = await decrypt(data.body, sharedSecret);
                const msg = JSON.parse(decrypted);
                if (msg.t === 'text') {
                    process.stdout.write(msg.text);
                }
            }
            catch {
                // Ignore decryption failures silently
            }
        }
    });
    socket.on('session-offline', () => {
        console.log('\nPC 세션이 오프라인으로 전환되었습니다.');
        process.exit(0);
    });
    socket.on('disconnect', () => {
        console.log('\n서버 연결이 끊어졌습니다.');
    });
    // Handle local keyboard input -> encrypt -> send to CLI
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on('data', async (data) => {
        if (!sharedSecret)
            return;
        // Ctrl+C handling
        if (data[0] === 3) {
            socket.disconnect();
            process.exit(0);
        }
        try {
            const msgStr = JSON.stringify({ t: 'text', text: data.toString() });
            const encrypted = await encrypt(msgStr, sharedSecret);
            socket.emit('update', {
                sessionId,
                sender: 'pwa',
                body: encrypted,
            });
        }
        catch {
            // Ignore encryption failures
        }
    });
    // Graceful shutdown
    process.on('SIGINT', () => {
        socket.disconnect();
        process.exit(0);
    });
});

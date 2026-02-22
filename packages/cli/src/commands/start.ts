import { Command } from 'commander';
import os from 'os';
import { generateECDHKeyPair, exportPublicKey, importPublicKey, deriveSharedSecret, encrypt, decrypt } from '@pocket-ai/wire';
import { getToken } from '../config.js';
import { connectToServer, registerSession } from '../server/connection.js';
import type { Socket } from 'socket.io-client';

export const startCommand = new Command('start')
  .description('AI CLI 세션 시작 (현재: foreground 모드)')
  .argument('[command]', 'AI CLI 명령어', 'claude')
  .option('--no-remote', '원격 접속 비활성화 (로컬 전용)')
  .action(async (command: string, options) => {
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
    let sessionId: string;
    try {
      sessionId = await registerSession(publicKeyBase64, {
        hostname: os.hostname(),
        engine: command,
      });
      console.log(`세션 등록 완료: ${sessionId.slice(0, 8)}...`);
    } catch (err: any) {
      console.error(`세션 등록 실패: ${err.message}`);
      process.exit(1);
    }

    // 3. Dynamically import node-pty (native module)
    let pty: any;
    try {
      pty = await import('node-pty');
    } catch {
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
    let socket: Socket | null = null;
    let sharedSecret: CryptoKey | null = null;

    shell.onData((data: string) => {
      process.stdout.write(data);

      // Also relay to remote clients if connected and key is derived
      if (sharedSecret && socket) {
        encrypt(JSON.stringify({ t: 'text', text: data }), sharedSecret)
          .then((encrypted) => {
            socket!.emit('update', {
              sessionId,
              sender: 'cli',
              body: encrypted,
            });
          })
          .catch(() => {}); // Non-critical: remote relay failure shouldn't break local
      }
    });

    // Handle local keyboard input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on('data', (data: Buffer) => {
      shell.write(data.toString());
    });

    // Handle terminal resize
    process.stdout.on('resize', () => {
      shell.resize(process.stdout.columns || 80, process.stdout.rows || 24);
    });

    // Handle CLI process exit
    shell.onExit(({ exitCode }: { exitCode: number }) => {
      console.log(`\nAI CLI 프로세스가 종료되었습니다 (code: ${exitCode})`);
      if (socket) socket.disconnect();
      process.exit(exitCode);
    });

    // 6. Connect to relay server
    if (options.remote !== false) {
      socket = connectToServer({
        sessionId,
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
            console.log('[Pocket AI] E2E 암호화 연결이 설정되었습니다.');
          } catch (err) {
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
            } catch (err) {
              console.error('[Pocket AI] 메시지 복호화 실패');
            }
          }
        },
        onDisconnect: () => {
          console.log('[Pocket AI] 서버 연결이 끊어졌습니다. 재연결 중...');
        },
      });
    }

    // Graceful shutdown
    const cleanup = () => {
      shell.kill();
      if (socket) socket.disconnect();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });

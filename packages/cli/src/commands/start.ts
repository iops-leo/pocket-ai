import { Command } from 'commander';
import os from 'os';
import { generateECDHKeyPair, exportPublicKey, exportPrivateKey, importPublicKey, importPrivateKey, deriveSharedSecret, encrypt, decrypt, generateSessionKey, exportSessionKey, importSessionKey, wrapSessionKey } from '@pocket-ai/wire';
import { getToken, saveSessionKeys, loadSessionKeys } from '../config.js';
import { connectToServer, registerSession } from '../server/connection.js';
import type { Socket } from 'socket.io-client';
import { SessionWatcher, getSessionKey, getSessionDisplayName, isValidEngine } from '../session-manager.js';
import { ClaudeSessionWatcher } from '../utils/session-watcher.js';

/**
 * AI CLI 세션 시작 (Happy 스타일 심플 래퍼)
 */
export async function startSession(command: string = 'claude', options: { remote?: boolean } = {}) {
  const token = getToken();
  if (!token) {
    console.error('로그인이 필요합니다. pocket-ai login을 먼저 실행하세요.');
    process.exit(1);
  }

  console.log(`Pocket AI - ${command} 세션을 시작합니다...`);

  const cwd = process.cwd();

  const existingKeys = loadSessionKeys(cwd);

  // 1. Session Key 로드/생성 (안정적인 메시지 암호화용 — registerNewSession보다 먼저 필요)
  let sessionKey: CryptoKey;
  if (existingKeys?.sessionKey) {
    try {
      sessionKey = await importSessionKey(existingKeys.sessionKey);
      console.log('[Pocket AI] 기존 session key 로드 완료 (이력 복호화 가능)');
    } catch {
      sessionKey = await generateSessionKey();
      console.log('[Pocket AI] 기존 session key 로드 실패, 새로 생성');
    }
  } else {
    sessionKey = await generateSessionKey();
    console.log('[Pocket AI] 새 session key 생성');
  }
  const sessionKeyBase64 = await exportSessionKey(sessionKey);

  // 2. ECDH 키 로드/생성 (Happy 방식: 기존 키가 있으면 로드, 없으면 새로 생성)
  let keyPair: CryptoKeyPair;
  let publicKeyBase64: string;
  let sessionId: string;

  if (existingKeys) {
    // 기존 키쌍 복원
    try {
      const privateKey = await importPrivateKey(existingKeys.privateKey);
      const publicKey = await importPublicKey(existingKeys.publicKey);
      keyPair = { privateKey, publicKey };
      publicKeyBase64 = existingKeys.publicKey;
      sessionId = existingKeys.sessionId;
      console.log(`기존 세션 복원: ${sessionId.slice(0, 8)}... (이력 복원 가능)`);
    } catch (err) {
      // 키 복원 실패 시 새로 생성
      console.log('기존 키 복원 실패, 새 세션을 생성합니다...');
      keyPair = await generateECDHKeyPair();
      publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
      sessionId = await registerNewSession(publicKeyBase64, command, cwd, keyPair);
    }
  } else {
    // 새 키쌍 생성
    keyPair = await generateECDHKeyPair();
    publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
    sessionId = await registerNewSession(publicKeyBase64, command, cwd, keyPair);
  }

  // 세션이 서버에 존재하는지 확인하고, 없으면 재등록
  try {
    // 세션 활성화 시도는 connectToServer에서 처리됨
  } catch (err: any) {
    console.error(`세션 등록 실패: ${err.message}`);
    process.exit(1);
  }

  // 새 세션 등록 헬퍼 함수
  async function registerNewSession(pubKey: string, cmd: string, cwdPath: string, kp: CryptoKeyPair): Promise<string> {
    const newSessionId = await registerSession(pubKey, {
      hostname: os.hostname(),
      engine: cmd,
      cwd: cwdPath,
    });
    console.log(`새 세션 등록: ${newSessionId.slice(0, 8)}...`);

    // 키쌍 로컬 저장 (Happy 방식)
    const privateKeyBase64 = await exportPrivateKey(kp.privateKey);
    saveSessionKeys(cwdPath, {
      publicKey: pubKey,
      privateKey: privateKeyBase64,
      sessionId: newSessionId,
      sessionKey: sessionKeyBase64,
    });
    console.log('[Pocket AI] 암호화 키 저장 완료 (이력 복원용)');

    return newSessionId;
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

  // JSONL session watcher — reads Claude Code's native transcript file
  // instead of parsing fragile PTY/ANSI output
  const sessionWatcher = new ClaudeSessionWatcher(process.cwd(), (events) => {
    if (sessionKey && socket) {
      for (const event of events) {
        encrypt(JSON.stringify(event), sessionKey)
          .then((encrypted) => {
            socket!.emit('update', {
              sessionId,
              sender: 'cli',
              body: encrypted,
            });
          })
          .catch(() => { });
      }
    }
  });
  sessionWatcher.start();

  shell.onData((data: string) => {
    process.stdout.write(data); // 로컬 터미널은 raw ANSI 그대로 (변경 없음)
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
    sessionWatcher.destroy();
    if (socket) socket.disconnect();
    process.exit(exitCode);
  });

  // 6. Connect to relay server
  if (options.remote !== false) {
    const sessionMetadata = { hostname: os.hostname(), engine: command, cwd: process.cwd() };
    socket = connectToServer({
      sessionId,
      publicKey: publicKeyBase64,
      metadata: sessionMetadata,
      onSessionIdUpdate: async (newSessionId) => {
        sessionId = newSessionId;
        // 새 세션 ID로 키 저장 갱신
        const privateKeyBase64 = await exportPrivateKey(keyPair.privateKey);
        saveSessionKeys(cwd, {
          publicKey: publicKeyBase64,
          privateKey: privateKeyBase64,
          sessionId: newSessionId,
          sessionKey: sessionKeyBase64,
        });
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
          // PWA sent its public key - derive shared secret (used only for session key transport)
          const peerPublicKey = await importPublicKey(data.publicKey);
          sharedSecret = await deriveSharedSecret(keyPair.privateKey, peerPublicKey);

          // Session key를 ECDH shared secret으로 wrap하여 PWA에 전송
          const wrappedKey = await wrapSessionKey(sessionKey, sharedSecret);
          socket!.emit('session-key', {
            sessionId,
            wrappedKey,
          });
          console.log('[Pocket AI] Session key 전송 완료');
        } catch (err) {
          console.error('[Pocket AI] 키교환 실패:', err);
        }
      },
      onUpdate: async (data) => {
        if (data.sender === 'pwa' && data.body && sessionKey) {
          try {
            const decrypted = await decrypt(data.body, sessionKey);
            const msg = JSON.parse(decrypted);
            if (msg.t === 'text') {
              const text = msg.text as string;
              // Claude Code's Ink TUI treats "text\r" as one chunk → \r becomes newline
              // Physical keyboard sends Enter (\r) as a SEPARATE keypress event → submit
              // Fix: separate text from \r and send with delay to simulate real typing
              if (text.endsWith('\r') || text.endsWith('\n')) {
                const content = text.slice(0, -1);
                if (content) shell.write(content);
                setTimeout(() => shell.write('\r'), 100);
              } else {
                shell.write(text);
              }
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

  process.stdin.on('data', (data: Buffer) => {
    const input = data.toString();

    // /switch 명령어 감지
    if (input.startsWith('/switch ')) {
      const newEngine = input.slice(8).trim();
      if (isValidEngine(newEngine)) {
        console.log(`\n[Pocket AI] AI 엔진을 ${newEngine}으로 전환합니다...`);
        // TODO: 현재 세션 종료 후 새 엔진으로 재시작
        console.log('(구현 예정: 현재는 수동으로 Ctrl+C 후 pocket-ai start ' + newEngine + ' 실행)\n');
      } else {
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
    sessionWatcher.destroy();
    shell.kill();
    if (socket) socket.disconnect();
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

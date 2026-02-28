import { Command } from 'commander';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { generateECDHKeyPair, exportPublicKey, exportPrivateKey, importPublicKey, importPrivateKey, deriveSharedSecret, encrypt, decrypt, generateSessionKey, exportSessionKey, importSessionKey, wrapSessionKey } from '@pocket-ai/wire';
import { getToken, saveSessionKeys, loadSessionKeys } from '../config.js';
import { connectToServer, registerSession } from '../server/connection.js';
import type { Socket } from 'socket.io-client';
import { SessionWatcher, getSessionDisplayName, isValidEngine, isPresetEngine, extractEngineName } from '../session-manager.js';
import { createSessionTranscriptWatcher } from '../utils/session-watcher.js';
import { collectSlashCommands } from '../utils/slash-commands.js';
import { ClaudeStreamBridge } from '../utils/claude-stream.js';
import { PtyPromptDetector } from '../utils/pty-prompt-detector.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface StartOptions {
  remote?: boolean;
  cwd?: string;
  attachSession?: string;
  headless?: boolean;
  cmd?: string;
}

function resolveWorkingDirectory(input?: string): string {
  const raw = (input && input.trim()) ? input.trim() : process.cwd();

  const expanded = raw === '~'
    ? os.homedir()
    : raw.startsWith('~/')
      ? path.join(os.homedir(), raw.slice(2))
      : raw;

  const resolved = path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(process.cwd(), expanded);

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`존재하지 않는 경로입니다: ${resolved}`);
  }

  return resolved;
}

function spawnSessionFromRequest(payload: { sessionId: string; engine: string; cwd: string }): void {
  const entryScript = process.argv[1];
  if (!entryScript) {
    console.error('[Pocket AI] spawn 실패: CLI entry를 찾을 수 없습니다.');
    return;
  }

  const child = spawn(
    process.execPath,
    [
      entryScript,
      'start',
      payload.engine,
      '--cwd',
      payload.cwd,
      '--attach-session',
      payload.sessionId,
      '--headless',
    ],
    {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    }
  );
  child.unref();
}

function stripAnsi(input: string): string {
  return input.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

// 설정 파일 경로
const CONFIG_DIR          = path.join(os.homedir(), '.config', 'pocket-ai');
const WORKERS_FILE        = path.join(CONFIG_DIR, 'workers.json');
const CONFIG_FILE         = path.join(CONFIG_DIR, 'config.json');
const SESSION_HISTORY_DIR = path.join(CONFIG_DIR, 'sessions');

function getHistoryFile(sid: string): string {
  return path.join(SESSION_HISTORY_DIR, sid, 'history.jsonl');
}

function appendToHistory(sid: string, event: Record<string, unknown>): void {
  try {
    const dir = path.join(SESSION_HISTORY_DIR, sid);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(getHistoryFile(sid), JSON.stringify({ ts: Date.now(), event }) + '\n', 'utf-8');
  } catch { /* 비치명적 */ }
}

interface PocketAiConfig {
  builtinWorkers: { gemini: boolean; codex: boolean; aider: boolean };
}

function loadConfig(): PocketAiConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return {
        builtinWorkers: {
          gemini: parsed.builtinWorkers?.gemini !== false,
          codex:  parsed.builtinWorkers?.codex  !== false,
          aider:  parsed.builtinWorkers?.aider  !== false,
        },
      };
    }
  } catch { /* 파싱 실패 시 기본값 사용 */ }
  return { builtinWorkers: { gemini: true, codex: true, aider: true } };
}

function saveConfig(config: Partial<PocketAiConfig>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const current = loadConfig();
  const merged = { ...current, ...config, builtinWorkers: { ...current.builtinWorkers, ...config.builtinWorkers } };
  const tmpPath = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), 'utf-8');
  fs.renameSync(tmpPath, CONFIG_FILE);
}

function saveWorkers(workers: Array<{ name: string; binary: string; description: string }>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmpPath = WORKERS_FILE + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(workers, null, 2), 'utf-8');
  fs.renameSync(tmpPath, WORKERS_FILE);
}

/**
 * AI CLI 세션 시작 (Happy 스타일 심플 래퍼)
 */
export async function startSession(command: string = 'claude', options: StartOptions = {}) {
  const token = getToken();
  if (!token) {
    console.error('로그인이 필요합니다. pocket-ai login을 먼저 실행하세요.');
    process.exit(1);
  }

  let resolvedCwd: string;
  try {
    resolvedCwd = resolveWorkingDirectory(options.cwd);
  } catch (err: any) {
    console.error(`[Pocket AI] ${err.message}`);
    process.exit(1);
  }

  process.chdir(resolvedCwd);
  const attachSessionId = options.attachSession?.trim() || '';
  const headless = Boolean(options.headless);

  const cwd = process.cwd();

  // --cmd가 지정된 경우: 커스텀 엔진
  const customCmd = options.cmd?.trim() || '';
  const engine = customCmd
    ? extractEngineName(customCmd)
    : command.trim().toLowerCase();
  const isCustomEngine = Boolean(customCmd);

  console.log(`Pocket AI - ${isCustomEngine ? customCmd : command} 세션을 시작합니다... (${resolvedCwd})`);

  const existingKeys = loadSessionKeys(cwd, engine);

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
  let shouldPersistKeys = false;

  if (existingKeys) {
    // 기존 키쌍 복원
    try {
      const privateKey = await importPrivateKey(existingKeys.privateKey);
      const publicKey = await importPublicKey(existingKeys.publicKey);
      keyPair = { privateKey, publicKey };
      publicKeyBase64 = existingKeys.publicKey;
      sessionId = attachSessionId || existingKeys.sessionId;
      shouldPersistKeys = Boolean(attachSessionId && attachSessionId !== existingKeys.sessionId);
      console.log(`기존 세션 복원: ${sessionId.slice(0, 8)}... (이력 복원 가능)`);
    } catch (err) {
      // 키 복원 실패 시 새로 생성
      console.log('기존 키 복원 실패, 새 세션을 생성합니다...');
      keyPair = await generateECDHKeyPair();
      publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
      if (attachSessionId) {
        sessionId = attachSessionId;
        shouldPersistKeys = true;
      } else {
        sessionId = await registerNewSession(publicKeyBase64, engine, cwd, keyPair);
      }
    }
  } else {
    // 새 키쌍 생성
    keyPair = await generateECDHKeyPair();
    publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
    if (attachSessionId) {
      sessionId = attachSessionId;
      shouldPersistKeys = true;
    } else {
      sessionId = await registerNewSession(publicKeyBase64, engine, cwd, keyPair);
    }
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
    }, cmd);
    console.log('[Pocket AI] 암호화 키 저장 완료 (이력 복원용)');

    return newSessionId;
  }

  async function persistSessionKeys(targetSessionId: string) {
    const privateKeyBase64 = await exportPrivateKey(keyPair.privateKey);
    saveSessionKeys(cwd, {
      publicKey: publicKeyBase64,
      privateKey: privateKeyBase64,
      sessionId: targetSessionId,
      sessionKey: sessionKeyBase64,
    }, engine);
  }

  if (shouldPersistKeys) {
    await persistSessionKeys(sessionId);
    console.log(`[Pocket AI] 세션 연결 정보 저장: ${sessionId.slice(0, 8)}...`);
  }
  if (attachSessionId) {
    console.log(`[Pocket AI] 지정된 세션에 연결합니다: ${sessionId.slice(0, 8)}...`);
  }

  // ─── Claude: JSON 스트리밍 모드 (Happy 방식) ───
  // Claude는 --output-format stream-json --input-format stream-json --permission-prompt-tool stdio 로
  // 구조화된 JSON 양방향 통신을 사용. 권한 프롬프트/선택지를 PWA에서 처리 가능.
  //
  // Codex/Gemini: 기존 PTY + JSONL/텍스트 릴레이 방식 유지.

  // Claude JSON 스트리밍은 프리셋 claude 엔진에서만 사용
  const useClaude = !isCustomEngine && engine === 'claude';
  let socket: Socket | null = null;
  let sharedSecret: CryptoKey | null = null;

  // 이벤트를 서버로 중계하는 공통 헬퍼
  function relayEvent(event: import('@pocket-ai/wire').SessionPayload): void {
    // 로컬 이력 저장 (text/tool 이벤트만, session-event 제외)
    if (event.t === 'text' || event.t === 'tool-call' || event.t === 'tool-result') {
      appendToHistory(sessionId, event as unknown as Record<string, unknown>);
    }
    if (!sessionKey || !socket) return;
    encrypt(JSON.stringify(event), sessionKey)
      .then((encrypted) => {
        socket!.emit('update', { sessionId, sender: 'cli', body: encrypted });
      })
      .catch(() => { });
  }

  // 로컬 이력을 PWA에 전송 (재연결 시)
  async function pushHistoryToPwa(): Promise<void> {
    const histFile = getHistoryFile(sessionId);
    if (!fs.existsSync(histFile) || !sessionKey || !socket) return;
    try {
      const lines = fs.readFileSync(histFile, 'utf-8').split('\n').filter(l => l.trim());
      if (lines.length === 0) return;
      const recent = lines.slice(-150); // 최근 150개 이벤트

      const send = async (payload: object) => {
        const enc = await encrypt(JSON.stringify(payload), sessionKey!);
        socket!.emit('update', { sessionId, sender: 'cli', body: enc });
      };

      await send({ t: 'session-event', event: 'history-start', data: { count: recent.length } });
      for (const line of recent) {
        try {
          const { ts, event } = JSON.parse(line);
          await send({ ...event, _ts: ts, _history: true });
        } catch { /* skip */ }
      }
      await send({ t: 'session-event', event: 'history-end' });
      console.log(`[Pocket AI] 로컬 이력 ${recent.length}개 PWA 전송 완료`);
    } catch (err: any) {
      console.error('[Pocket AI] 이력 전송 실패:', err.message);
    }
  }

  // PWA 재연결 시 pending permissions 재전송용 (Claude 전용, bridge 생성 후 설정)
  let getPendingInputRequests: (() => import('@pocket-ai/wire').SessionMessageInputRequest[]) | null = null;

  // ─── 공통 서버 연결 옵션 (엔진 불문) ───
  function buildServerOptions(onPwaMessage: (msg: Record<string, unknown>) => void) {
    return {
      sessionId,
      publicKey: publicKeyBase64,
      metadata: { hostname: os.hostname(), engine, cwd } as Record<string, string>,
      onSessionIdUpdate: async (newSessionId: string) => {
        sessionId = newSessionId;
        await persistSessionKeys(newSessionId);
        console.log(`[Pocket AI] 세션 재등록 완료: ${newSessionId.slice(0, 8)}...`);
      },
      onAuthSuccess: (data: { sessionId: string }) => {
        console.log(`서버 연결 완료 (세션: ${data.sessionId.slice(0, 8)}...)`);
        console.log('원격 접속 대기 중... (PWA 또는 다른 머신에서 접속 가능)\n');
      },
      onAuthError: (data: { error: string }) => {
        console.error(`서버 인증 실패: ${data.error}`);
      },
      onKeyExchange: async (data: { publicKey: string }) => {
        try {
          const peerPublicKey = await importPublicKey(data.publicKey);
          sharedSecret = await deriveSharedSecret(keyPair.privateKey, peerPublicKey);
          const wrappedKey = await wrapSessionKey(sessionKey, sharedSecret);
          socket!.emit('session-key', { sessionId, wrappedKey });
          console.log('[Pocket AI] Session key 전송 완료');

          try {
            const commands = collectSlashCommands(engine, cwd);
            if (commands.length > 0) {
              socket!.emit('slash-commands', { sessionId, commands });
              console.log(`[Pocket AI] 슬래시 명령어 ${commands.length}개 전송 완료`);
            }
          } catch { /* 비치명적 */ }

          // PWA 재연결 시 응답 대기 중인 permission 요청 재전송
          if (getPendingInputRequests) {
            const pending = getPendingInputRequests();
            for (const req of pending) {
              relayEvent(req);
              console.log(`[Pocket AI] Pending permission 재전송: ${req.toolName}`);
            }
          }

          // PWA 재연결 시 로컬 이력 전송
          await pushHistoryToPwa();
        } catch (err) {
          console.error('[Pocket AI] 키교환 실패:', err);
        }
      },
      onUpdate: async (data: { sender: string; body?: import('@pocket-ai/wire').EncryptedBody }) => {
        if (data.sender === 'pwa' && data.body && sessionKey) {
          try {
            const decrypted = await decrypt(data.body, sessionKey);
            const msg = JSON.parse(decrypted);
            onPwaMessage(msg);
          } catch {
            console.error('[Pocket AI] 메시지 복호화 실패');
          }
        }
      },
      onDisconnect: () => {
        console.log('[Pocket AI] 서버 연결이 끊어졌습니다. 재연결 중...');
      },
    };
  }

  if (useClaude) {
    // ════════════════════════════════════════════════════
    // Claude 전용: JSON 스트리밍 브릿지 및 MCP 오케스트레이터
    // ════════════════════════════════════════════════════

    // 1. MCP 오케스트레이터 ~/.claude/claude.json 등록
    // Claude가 자체적으로 MCP 서버를 spawn하므로 여기서 프로세스를 띄울 필요 없음
    const mcpServerPath = path.resolve(__dirname, '..', 'mcp', 'orchestrator-server.js');

    if (fs.existsSync(mcpServerPath)) {
      const claudeConfigPath = path.join(os.homedir(), '.claude', 'claude.json');
      try {
        let config: any = {};
        if (fs.existsSync(claudeConfigPath)) {
          config = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf-8'));
        }
        if (!config.mcpServers) config.mcpServers = {};

        // cwd를 env로 주입 → orchestrator-server가 워커 실행 시 올바른 디렉토리 사용
        const savedCfg = loadConfig();
        config.mcpServers['pocket-ai-orchestrator'] = {
          command: process.execPath,
          args: [mcpServerPath],
          env: {
            POCKET_AI_CWD: cwd,
            POCKET_AI_ENABLE_GEMINI: String(savedCfg.builtinWorkers.gemini),
            POCKET_AI_ENABLE_AIDER:  String(savedCfg.builtinWorkers.aider),
            POCKET_AI_ENABLE_CODEX:  String(savedCfg.builtinWorkers.codex),
            ...(process.env.GEMINI_API_KEY ? { GEMINI_API_KEY: process.env.GEMINI_API_KEY } : {}),
            ...(process.env.GOOGLE_API_KEY ? { GOOGLE_API_KEY: process.env.GOOGLE_API_KEY } : {}),
            ...(process.env.OPENAI_API_KEY ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY } : {}),
          },
        };

        // 원자적 쓰기: race condition 방지
        fs.mkdirSync(path.dirname(claudeConfigPath), { recursive: true });
        const tmpPath = claudeConfigPath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
        fs.renameSync(tmpPath, claudeConfigPath);
        console.log('[Pocket AI] Multi-Model Orchestrator MCP 등록 완료');
      } catch (err: any) {
        console.error('[Pocket AI] MCP 서버 설정 등록 실패:', err.message);
      }
    }

    const bridge = new ClaudeStreamBridge({
      cwd,
      headless,
      onMessage: (event) => relayEvent(event),
      onPermissionRequest: (request) => relayEvent(request),
      onReady: () => {
        // Claude가 입력 대기 상태임을 PWA에 알림 (선택적)
        relayEvent({ t: 'session-event', event: 'stopped-typing' });
      },
      onSessionId: (claudeSessionId) => {
        console.log(`[ClaudeStream] Claude 세션 ID: ${claudeSessionId.slice(0, 8)}...`);
      },
      onExit: (code) => {
        console.log(`\nClaude 프로세스가 종료되었습니다 (code: ${code})`);
        if (socket) socket.disconnect();
        process.exit(code);
      },
    });

    getPendingInputRequests = () => bridge.getPendingInputRequests();
    bridge.start();

    // 로컬 stdin → Claude (headless가 아닌 경우)
    if (!headless) {
      process.stdin.resume();
      const rl = await import('readline');
      const stdinRl = rl.createInterface({ input: process.stdin, output: process.stdout });
      stdinRl.on('line', (line: string) => {
        bridge.sendMessage(line);
      });
    }

    // 서버 연결
    if (options.remote !== false) {
      socket = connectToServer(buildServerOptions((msg) => {
        // PWA → Claude: 텍스트 메시지
        if (msg.t === 'text') {
          const text = (msg.text as string).replace(/[\r\n]+$/, '');
          if (text) {
            // 사용자 메시지도 로컬 이력에 저장
            appendToHistory(sessionId, { t: 'text', text, role: 'user' });
            bridge.sendMessage(text);
          }
        }
        // PWA → Claude: 권한 응답
        if (msg.t === 'input-response') {
          bridge.respondToPermission(
            msg.requestId as string,
            msg.approved as boolean,
            msg.message as string | undefined,
          );
        }
        // PWA → Claude: 인터럽트 (응답 중단)
        if (msg.t === 'session-event' && (msg as any).event === 'interrupt') {
          bridge.interrupt();
          console.log('[Pocket AI] 인터럽트 신호 전송');
        }
        // PWA → Claude: 원격 설정 변경 (퍼미션 모드, 모델)
        if (msg.t === 'control-command') {
          const cmd = msg as unknown as import('@pocket-ai/wire').SessionMessageControlCommand;
          if (cmd.command === 'set-permission-mode') {
            bridge.setPermissionMode(cmd.value as import('../utils/claude-stream.js').PermissionMode);
            console.log(`[Pocket AI] 퍼미션 모드 변경: ${cmd.value}`);
          } else if (cmd.command === 'set-model' && cmd.value && cmd.value !== 'default') {
            bridge.sendMessage(`/model ${cmd.value}`);
            console.log(`[Pocket AI] 모델 변경 요청: ${cmd.value}`);
          } else if ((cmd.command as string) === 'set-workers' && Array.isArray((cmd as any).workers)) {
            try {
              saveWorkers((cmd as any).workers);
              console.log(`[Pocket AI] 커스텀 worker 저장: ${(cmd as any).workers.length}개 (다음 Claude 요청부터 적용)`);
            } catch (err: any) {
              console.error('[Pocket AI] worker 저장 실패:', err.message);
            }
          } else if ((cmd.command as string) === 'set-builtin-workers') {
            const workers = (cmd as any).workers as { gemini?: boolean; codex?: boolean; aider?: boolean };
            try {
              // 1. config.json에 영속화 (다음 pocket-ai 시작 시 반영)
              saveConfig({ builtinWorkers: {
                gemini: workers.gemini !== false,
                codex:  workers.codex  !== false,
                aider:  workers.aider  !== false,
              }});

              // 2. 현재 실행 중인 claude.json MCP env도 즉시 업데이트
              const claudeConfigPath = path.join(os.homedir(), '.claude', 'claude.json');
              if (fs.existsSync(claudeConfigPath)) {
                const cfg = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf-8'));
                if (cfg.mcpServers?.['pocket-ai-orchestrator']?.env) {
                  cfg.mcpServers['pocket-ai-orchestrator'].env.POCKET_AI_ENABLE_GEMINI = String(workers.gemini !== false);
                  cfg.mcpServers['pocket-ai-orchestrator'].env.POCKET_AI_ENABLE_CODEX  = String(workers.codex  !== false);
                  cfg.mcpServers['pocket-ai-orchestrator'].env.POCKET_AI_ENABLE_AIDER  = String(workers.aider  !== false);
                  const tmpPath = claudeConfigPath + '.tmp';
                  fs.writeFileSync(tmpPath, JSON.stringify(cfg, null, 2), 'utf-8');
                  fs.renameSync(tmpPath, claudeConfigPath);
                }
              }
              console.log(`[Pocket AI] 빌트인 worker 저장: gemini=${workers.gemini}, codex=${workers.codex}, aider=${workers.aider}`);
            } catch (err: any) {
              console.error('[Pocket AI] 빌트인 worker 설정 실패:', err.message);
            }
          }
        }
      }));

      socket.on('session-spawn-request', (payload: any) => {
        if (!payload || typeof payload.sessionId !== 'string') return;
        const requestedEngine = typeof payload?.metadata?.engine === 'string'
          ? payload.metadata.engine.trim().toLowerCase() : '';
        const requestedCwd = typeof payload?.metadata?.cwd === 'string'
          ? payload.metadata.cwd.trim() : '';
        if (!requestedEngine || !isPresetEngine(requestedEngine) || !requestedCwd) return;
        console.log(`[Pocket AI] 원격 세션 생성 요청: ${payload.sessionId.slice(0, 8)}... (${requestedEngine})`);
        spawnSessionFromRequest({ sessionId: payload.sessionId, engine: requestedEngine, cwd: requestedCwd });
      });
    }

    // Graceful shutdown
    const cleanup = () => {
      bridge.kill();
      if (socket) socket.disconnect();
      // Pocket AI 종료 시 MCP 오케스트레이터 등록 해제 (PWA 전용 기능 보장)
      try {
        const cfgPath = path.join(os.homedir(), '.claude', 'claude.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          if (cfg.mcpServers?.['pocket-ai-orchestrator']) {
            delete cfg.mcpServers['pocket-ai-orchestrator'];
            // 원자적 쓰기: race condition 방지
            const tmpPath = cfgPath + '.tmp';
            fs.writeFileSync(tmpPath, JSON.stringify(cfg, null, 2), 'utf-8');
            fs.renameSync(tmpPath, cfgPath);
          }
        }
      } catch { }
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

  } else {
    // ════════════════════════════════════════════════════
    // Codex / Gemini: 기존 PTY + JSONL/텍스트 릴레이
    // ════════════════════════════════════════════════════

    // Dynamically import node-pty (native module)
    let pty: any;
    try {
      pty = await import('node-pty');
    } catch {
      console.error('node-pty를 로드할 수 없습니다. npm install 후 다시 시도하세요.');
      process.exit(1);
    }

    // 커스텀 명령어 파싱: "aider --model gpt-4" → binary="aider", args=["--model", "gpt-4"]
    const ptyParts = isCustomEngine ? customCmd.split(/\s+/) : [command];
    const ptyBinary = ptyParts[0];
    const ptyArgs = ptyParts.slice(1);

    const shell = pty.default.spawn(ptyBinary, ptyArgs, {
      name: 'xterm-256color',
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
      cwd,
      env: { ...process.env },
    });

    // 커스텀 엔진은 세션 파일 감시 없음 → 순수 PTY 텍스트 릴레이
    const sessionWatcher = isCustomEngine
      ? null
      : createSessionTranscriptWatcher(engine, cwd, (events) => {
        for (const event of events) relayEvent(event);
      });
    sessionWatcher?.start();
    const shouldRelayPtyText = !sessionWatcher;

    // 프롬프트 감지는 프리셋 엔진(codex/gemini)에서만
    const isDetectableEngine = !isCustomEngine && (engine === 'codex' || engine === 'gemini');
    const promptDetector = isDetectableEngine
      ? new PtyPromptDetector(engine as 'codex' | 'gemini', (request) => {
        relayEvent(request);
        if (!headless) {
          console.log(`\n[Pocket AI] 권한 요청 감지: ${request.message || request.toolName}`);
          console.log('[Pocket AI] PWA에서 응답 대기 중...');
        }
      })
      : null;

    shell.onData((data: string) => {
      if (!headless) {
        process.stdout.write(data);
      }

      promptDetector?.feed(data);

      if (shouldRelayPtyText && socket && sessionKey) {
        const plainText = stripAnsi(data).replace(/\r/g, '');
        if (!plainText.trim()) return;
        relayEvent({ t: 'text', text: plainText });
      }
    });

    if (!headless) {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      process.stdin.on('data', (data: Buffer) => {
        shell.write(data.toString());
      });

      process.stdout.on('resize', () => {
        shell.resize(process.stdout.columns || 80, process.stdout.rows || 24);
      });
    }

    shell.onExit(({ exitCode }: { exitCode: number }) => {
      console.log(`\nAI CLI 프로세스가 종료되었습니다 (code: ${exitCode})`);
      sessionWatcher?.destroy();
      if (socket) socket.disconnect();
      process.exit(exitCode);
    });

    // 서버 연결
    if (options.remote !== false) {
      socket = connectToServer(buildServerOptions((msg) => {
        if (msg.t === 'text') {
          const text = msg.text as string;
          if (text.endsWith('\r') || text.endsWith('\n')) {
            const content = text.slice(0, -1);
            if (content) shell.write(content);
            setTimeout(() => shell.write('\r'), 100);
          } else {
            shell.write(text);
          }
        }
        // PWA → Codex/Gemini: 권한 응답
        if (msg.t === 'input-response' && promptDetector) {
          const key = promptDetector.respond(
            msg.requestId as string,
            msg.approved as boolean,
          );
          if (key) {
            shell.write(key);
            if (!headless) {
              console.log(`[Pocket AI] 권한 ${msg.approved ? '허용' : '거부'} → PTY 전송`);
            }
          }
        }
      }));

      socket.on('session-spawn-request', (payload: any) => {
        if (!payload || typeof payload.sessionId !== 'string') return;
        const requestedEngine = typeof payload?.metadata?.engine === 'string'
          ? payload.metadata.engine.trim().toLowerCase() : '';
        const requestedCwd = typeof payload?.metadata?.cwd === 'string'
          ? payload.metadata.cwd.trim() : '';
        if (!requestedEngine || !isPresetEngine(requestedEngine) || !requestedCwd) return;
        console.log(`[Pocket AI] 원격 세션 생성 요청: ${payload.sessionId.slice(0, 8)}... (${requestedEngine})`);
        spawnSessionFromRequest({ sessionId: payload.sessionId, engine: requestedEngine, cwd: requestedCwd });
      });
    }

    let watcher: SessionWatcher | null = null;
    if (!headless) {
      watcher = new SessionWatcher(engine);
      watcher.onCwdChange((oldKey, newKey) => {
        console.log(`\n[Pocket AI] 폴더 변경 감지: ${getSessionDisplayName(oldKey)} → ${getSessionDisplayName(newKey)}`);
        console.log('현재 세션을 계속 사용합니다. 새 세션을 시작하려면 Ctrl+C 후 pocket-ai를 다시 실행하세요.\n');
      });
      watcher.start();

      process.stdin.removeAllListeners('data');
      process.stdin.on('data', (data: Buffer) => {
        const input = data.toString();
        if (input.startsWith('/switch ')) {
          const newEngine = input.slice(8).trim();
          if (newEngine) {
            console.log(`\n[Pocket AI] AI 엔진을 ${newEngine}으로 전환합니다...`);
            console.log('(구현 예정: 현재는 수동으로 Ctrl+C 후 pocket-ai start ' + newEngine + ' 실행)\n');
          } else {
            console.log(`\n[Pocket AI] 엔진 이름을 입력해주세요.`);
            console.log('예: /switch claude, /switch codex, /switch aider\n');
          }
          return;
        }
        shell.write(input);
      });
    }

    // Graceful shutdown
    const cleanup = () => {
      watcher?.stop();
      sessionWatcher?.destroy();
      shell.kill();
      if (socket) socket.disconnect();
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
}

export const startCommand = new Command('start')
  .description('AI CLI 세션 시작 (고급: 특정 AI 엔진 지정)')
  .argument('[command]', 'AI CLI 명령어', 'claude')
  .option('--cwd <path>', '작업 디렉토리 지정')
  .option('--attach-session <id>', '기존 sessionId에 attach (내부용)')
  .option('--headless', '백그라운드(원격 전용) 모드')
  .option('--no-remote', '원격 접속 비활성화 (로컬 전용)')
  .option('--cmd <command>', '커스텀 AI CLI 명령어 (예: "aider --model gpt-4")')
  .action(startSession);

import crypto from 'crypto';
import path from 'path';

/**
 * 세션 식별자 생성 (Happy 스타일)
 *
 * 폴더 + AI 엔진 조합으로 고유한 세션 생성
 * 예: /project/A + claude → session-abc123
 *     /project/B + gemini → session-def456
 *     /project/A + gemini → session-ghi789 (다른 세션!)
 */

export interface SessionKey {
  cwd: string;           // 작업 디렉토리 절대 경로
  engine: string;        // AI 엔진: claude, codex, gemini
  hash: string;          // 세션 해시 (고유 ID)
}

/**
 * 현재 컨텍스트의 세션 키 생성
 */
export function getSessionKey(cwd: string = process.cwd(), engine: string = 'claude'): SessionKey {
  const normalizedCwd = path.resolve(cwd);
  const keyString = `${normalizedCwd}:${engine}`;
  const hash = crypto.createHash('sha256').update(keyString).digest('hex').slice(0, 12);

  return {
    cwd: normalizedCwd,
    engine,
    hash
  };
}

/**
 * 세션 표시 이름 생성
 */
export function getSessionDisplayName(sessionKey: SessionKey): string {
  const folderName = path.basename(sessionKey.cwd);
  return `${folderName} (${sessionKey.engine})`;
}

/**
 * 폴더 변경 감지 콜백 타입
 */
export type CwdChangeCallback = (oldKey: SessionKey, newKey: SessionKey) => void;

/**
 * 폴더 변경 감지기
 *
 * Happy처럼 작업 디렉토리 변경을 감지하고 자동으로 세션 전환
 */
export class SessionWatcher {
  private currentKey: SessionKey;
  private currentEngine: string;
  private intervalId: NodeJS.Timeout | null = null;
  private callbacks: CwdChangeCallback[] = [];

  constructor(engine: string = 'claude') {
    this.currentEngine = engine;
    this.currentKey = getSessionKey(process.cwd(), engine);
  }

  /**
   * 폴더 변경 감지 시작
   */
  start(intervalMs: number = 1000): void {
    if (this.intervalId) return; // 이미 실행 중

    this.intervalId = setInterval(() => {
      const newCwd = process.cwd();
      const newKey = getSessionKey(newCwd, this.currentEngine);

      // 세션 키가 변경되었는지 확인 (cwd만 비교)
      if (newKey.hash !== this.currentKey.hash && newKey.cwd !== this.currentKey.cwd) {
        const oldKey = this.currentKey;
        this.currentKey = newKey;

        // 콜백 실행
        this.callbacks.forEach(cb => cb(oldKey, newKey));
      }
    }, intervalMs);
  }

  /**
   * 감지 중지
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * 폴더 변경 콜백 등록
   */
  onCwdChange(callback: CwdChangeCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * 현재 엔진 변경 (세션 내 AI 전환)
   */
  switchEngine(newEngine: string): SessionKey {
    this.currentEngine = newEngine;
    const newKey = getSessionKey(this.currentKey.cwd, newEngine);
    this.currentKey = newKey;
    return newKey;
  }

  /**
   * 현재 세션 키 반환
   */
  getCurrentKey(): SessionKey {
    return this.currentKey;
  }
}

/**
 * 프리셋 AI 엔진 목록 (특별 처리가 있는 엔진)
 */
export const PRESET_ENGINES = ['claude', 'codex', 'gemini'] as const;
export type PresetEngine = typeof PRESET_ENGINES[number];

/** backward-compat alias */
export const SUPPORTED_ENGINES = PRESET_ENGINES;
export type SupportedEngine = PresetEngine;

/**
 * 프리셋 엔진 여부 확인
 */
export function isPresetEngine(engine: string): engine is PresetEngine {
  return PRESET_ENGINES.includes(engine as PresetEngine);
}

/**
 * 엔진 유효성 검증: 비어있지 않은 문자열이면 모두 허용 (커스텀 엔진 지원)
 */
export function isValidEngine(engine: string): boolean {
  return engine.trim().length > 0;
}

/**
 * 커스텀 명령어에서 엔진명 추출 (첫 번째 단어의 바이너리명)
 * e.g. "/usr/local/bin/aider --model gpt-4" → "aider"
 */
export function extractEngineName(cmd: string): string {
  const first = cmd.trim().split(/\s+/)[0];
  return first.split('/').pop()?.split('\\').pop() || first;
}

/**
 * 세션 식별자 생성 (Happy 스타일)
 *
 * 폴더 + AI 엔진 조합으로 고유한 세션 생성
 * 예: /project/A + claude → session-abc123
 *     /project/B + gemini → session-def456
 *     /project/A + gemini → session-ghi789 (다른 세션!)
 */
export interface SessionKey {
    cwd: string;
    engine: string;
    hash: string;
}
/**
 * 현재 컨텍스트의 세션 키 생성
 */
export declare function getSessionKey(cwd?: string, engine?: string): SessionKey;
/**
 * 세션 표시 이름 생성
 */
export declare function getSessionDisplayName(sessionKey: SessionKey): string;
/**
 * 폴더 변경 감지 콜백 타입
 */
export type CwdChangeCallback = (oldKey: SessionKey, newKey: SessionKey) => void;
/**
 * 폴더 변경 감지기
 *
 * Happy처럼 작업 디렉토리 변경을 감지하고 자동으로 세션 전환
 */
export declare class SessionWatcher {
    private currentKey;
    private currentEngine;
    private intervalId;
    private callbacks;
    constructor(engine?: string);
    /**
     * 폴더 변경 감지 시작
     */
    start(intervalMs?: number): void;
    /**
     * 감지 중지
     */
    stop(): void;
    /**
     * 폴더 변경 콜백 등록
     */
    onCwdChange(callback: CwdChangeCallback): void;
    /**
     * 현재 엔진 변경 (세션 내 AI 전환)
     */
    switchEngine(newEngine: string): SessionKey;
    /**
     * 현재 세션 키 반환
     */
    getCurrentKey(): SessionKey;
}
/**
 * 프리셋 AI 엔진 목록 (특별 처리가 있는 엔진)
 */
export declare const PRESET_ENGINES: readonly ["claude", "codex", "gemini"];
export type PresetEngine = typeof PRESET_ENGINES[number];
/** backward-compat alias */
export declare const SUPPORTED_ENGINES: readonly ["claude", "codex", "gemini"];
export type SupportedEngine = PresetEngine;
/**
 * 프리셋 엔진 여부 확인
 */
export declare function isPresetEngine(engine: string): engine is PresetEngine;
/**
 * 엔진 유효성 검증: 비어있지 않은 문자열이면 모두 허용 (커스텀 엔진 지원)
 */
export declare function isValidEngine(engine: string): boolean;
/**
 * 커스텀 명령어에서 엔진명 추출 (첫 번째 단어의 바이너리명)
 * e.g. "/usr/local/bin/aider --model gpt-4" → "aider"
 */
export declare function extractEngineName(cmd: string): string;

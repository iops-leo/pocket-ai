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
 * 지원하는 AI 엔진 목록
 */
export declare const SUPPORTED_ENGINES: readonly ["claude", "codex", "gemini"];
export type SupportedEngine = typeof SUPPORTED_ENGINES[number];
/**
 * 엔진 유효성 검증
 */
export declare function isValidEngine(engine: string): engine is SupportedEngine;

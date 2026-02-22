import crypto from 'crypto';
import path from 'path';
/**
 * 현재 컨텍스트의 세션 키 생성
 */
export function getSessionKey(cwd = process.cwd(), engine = 'claude') {
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
export function getSessionDisplayName(sessionKey) {
    const folderName = path.basename(sessionKey.cwd);
    return `${folderName} (${sessionKey.engine})`;
}
/**
 * 폴더 변경 감지기
 *
 * Happy처럼 작업 디렉토리 변경을 감지하고 자동으로 세션 전환
 */
export class SessionWatcher {
    currentKey;
    currentEngine;
    intervalId = null;
    callbacks = [];
    constructor(engine = 'claude') {
        this.currentEngine = engine;
        this.currentKey = getSessionKey(process.cwd(), engine);
    }
    /**
     * 폴더 변경 감지 시작
     */
    start(intervalMs = 1000) {
        if (this.intervalId)
            return; // 이미 실행 중
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
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
    /**
     * 폴더 변경 콜백 등록
     */
    onCwdChange(callback) {
        this.callbacks.push(callback);
    }
    /**
     * 현재 엔진 변경 (세션 내 AI 전환)
     */
    switchEngine(newEngine) {
        this.currentEngine = newEngine;
        const newKey = getSessionKey(this.currentKey.cwd, newEngine);
        this.currentKey = newKey;
        return newKey;
    }
    /**
     * 현재 세션 키 반환
     */
    getCurrentKey() {
        return this.currentKey;
    }
}
/**
 * 지원하는 AI 엔진 목록
 */
export const SUPPORTED_ENGINES = ['claude', 'codex', 'gemini'];
/**
 * 엔진 유효성 검증
 */
export function isValidEngine(engine) {
    return SUPPORTED_ENGINES.includes(engine);
}

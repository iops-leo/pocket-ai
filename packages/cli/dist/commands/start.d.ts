import { Command } from 'commander';
interface StartOptions {
    remote?: boolean;
    cwd?: string;
    attachSession?: string;
    headless?: boolean;
    cmd?: string;
}
/**
 * AI CLI 세션 시작 (Happy 스타일 심플 래퍼)
 */
export declare function startSession(command?: string, options?: StartOptions): Promise<void>;
export declare const startCommand: Command;
export {};

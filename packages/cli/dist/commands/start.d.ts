import { Command } from 'commander';
/**
 * AI CLI 세션 시작 (Happy 스타일 심플 래퍼)
 */
export declare function startSession(command?: string, options?: {
    remote?: boolean;
}): Promise<void>;
export declare const startCommand: Command;

export interface SlashCommand {
    name: string;
    source: 'global' | 'plugin' | 'project';
}
/**
 * 엔진별 슬래시 명령어 수집
 */
export declare function collectSlashCommands(engine: string, cwd: string): SlashCommand[];

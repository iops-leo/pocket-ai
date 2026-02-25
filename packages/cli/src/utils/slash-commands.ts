import fs from 'fs';
import os from 'os';
import path from 'path';

export interface SlashCommand {
    name: string;       // 예: "commit", "sc:build", "review"
    source: 'global' | 'plugin' | 'project';
}

/**
 * Claude CLI 슬래시 명령어 스캔
 *
 * 스캔 위치:
 * 1. ~/.claude/commands/          (글로벌 사용자 명령어)
 * 2. ~/.claude/plugins/.../commands/ (설치된 플러그인 명령어)
 * 3. <cwd>/.claude/commands/       (프로젝트 로컬 명령어)
 */
function scanClaudeCommands(cwd: string): SlashCommand[] {
    const commands: SlashCommand[] = [];
    const claudeHome = path.join(os.homedir(), '.claude');

    // 1. 글로벌 명령어: ~/.claude/commands/
    const globalDir = path.join(claudeHome, 'commands');
    scanCommandDir(globalDir, '', commands, 'global');

    // 2. 플러그인 명령어: ~/.claude/plugins/**/commands/
    const pluginsDir = path.join(claudeHome, 'plugins');
    scanPluginCommands(pluginsDir, commands);

    // 3. 프로젝트 로컬 명령어: <cwd>/.claude/commands/
    const projectDir = path.join(cwd, '.claude', 'commands');
    scanCommandDir(projectDir, '', commands, 'project');

    // 중복 제거 (이름 기준, project > global > plugin 우선)
    const seen = new Map<string, SlashCommand>();
    for (const cmd of commands) {
        const existing = seen.get(cmd.name);
        if (!existing || priorityOf(cmd.source) > priorityOf(existing.source)) {
            seen.set(cmd.name, cmd);
        }
    }

    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function priorityOf(source: SlashCommand['source']): number {
    switch (source) {
        case 'project': return 3;
        case 'global': return 2;
        case 'plugin': return 1;
    }
}

function scanCommandDir(dir: string, prefix: string, commands: SlashCommand[], source: SlashCommand['source']): void {
    if (!fs.existsSync(dir)) return;

    let entries: string[];
    try {
        entries = fs.readdirSync(dir);
    } catch {
        return;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile() && entry.endsWith('.md')) {
                const name = prefix
                    ? `${prefix}:${entry.replace(/\.md$/, '')}`
                    : entry.replace(/\.md$/, '');
                commands.push({ name, source });
            } else if (stat.isDirectory()) {
                // 서브디렉토리 = 네임스페이스 (예: sc/build.md → "sc:build")
                scanCommandDir(fullPath, prefix ? `${prefix}:${entry}` : entry, commands, source);
            }
        } catch {
            // 접근 불가 파일 무시
        }
    }
}

function scanPluginCommands(pluginsDir: string, commands: SlashCommand[]): void {
    if (!fs.existsSync(pluginsDir)) return;

    // 재귀적으로 commands/ 디렉토리를 찾음
    function walk(dir: string, depth: number): void {
        if (depth > 6) return; // 과도한 깊이 방지

        let entries: string[];
        try {
            entries = fs.readdirSync(dir);
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            try {
                const stat = fs.statSync(fullPath);
                if (!stat.isDirectory()) continue;

                if (entry === 'commands') {
                    scanCommandDir(fullPath, '', commands, 'plugin');
                } else {
                    walk(fullPath, depth + 1);
                }
            } catch {
                // 접근 불가 디렉토리 무시
            }
        }
    }

    walk(pluginsDir, 0);
}

/**
 * Codex/Gemini 기본 슬래시 명령어 (하드코딩)
 */
const CODEX_DEFAULT_COMMANDS: SlashCommand[] = [
    { name: 'help', source: 'global' },
    { name: 'clear', source: 'global' },
    { name: 'compact', source: 'global' },
    { name: 'history', source: 'global' },
];

const GEMINI_DEFAULT_COMMANDS: SlashCommand[] = [
    { name: 'help', source: 'global' },
    { name: 'clear', source: 'global' },
    { name: 'compact', source: 'global' },
    { name: 'stats', source: 'global' },
];

/**
 * 엔진별 슬래시 명령어 수집
 */
export function collectSlashCommands(engine: string, cwd: string): SlashCommand[] {
    const normalized = engine.trim().toLowerCase();

    switch (normalized) {
        case 'claude':
            return scanClaudeCommands(cwd);
        case 'codex':
            return CODEX_DEFAULT_COMMANDS;
        case 'gemini':
            return GEMINI_DEFAULT_COMMANDS;
        default:
            return [];
    }
}

'use client';
import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, GitBranch } from 'lucide-react';
import { useTranslations } from 'next-intl';

const WORKER_DEFS: Record<string, { badge: string; ringColor: string; badgeColor: string }> = {
    ask_gemini: {
        badge: 'Google',
        ringColor: 'border-blue-500/40 bg-blue-500/5',
        badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    },
    ask_codex: {
        badge: 'OpenAI',
        ringColor: 'border-green-500/40 bg-green-500/5',
        badgeColor: 'text-green-400 bg-green-500/10 border-green-500/30',
    },
    ask_aider: {
        badge: 'Aider',
        ringColor: 'border-orange-500/40 bg-orange-500/5',
        badgeColor: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    },
};

function getWorkerDef(name: string) {
    return WORKER_DEFS[name] ?? {
        badge: 'Custom',
        ringColor: 'border-purple-500/40 bg-purple-500/5',
        badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    };
}

function parsePrompt(args: string): string {
    try {
        const parsed = JSON.parse(args);
        if (typeof parsed.prompt === 'string') return parsed.prompt;
    } catch { /* fall through */ }
    return args;
}

function parseAiderFiles(output: string): string[] {
    const files: string[] = [];
    const patterns = [/Applied edit to (.+)/g, /Wrote (.+)/g];
    for (const re of patterns) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(output)) !== null) files.push(m[1].trim());
    }
    return Array.from(new Set(files));
}

interface OrchestratorWorkerCardProps {
    name: string;
    args: string;
    output?: string;
    status: 'running' | 'done' | 'error';
    startTime?: number;
}

export function OrchestratorWorkerCard({ name, args, output, status, startTime }: OrchestratorWorkerCardProps) {
    const t = useTranslations('chat');
    const [elapsed, setElapsed] = useState(0);
    const [expanded, setExpanded] = useState(status === 'error');
    const def = getWorkerDef(name);
    const prompt = parsePrompt(args);
    const aiderFiles = name === 'ask_aider' && output ? parseAiderFiles(output) : [];

    useEffect(() => {
        if (status !== 'running') return;
        const base = startTime ?? Date.now();
        setElapsed(Math.floor((Date.now() - base) / 1000));
        const id = setInterval(() => setElapsed(Math.floor((Date.now() - base) / 1000)), 1000);
        return () => clearInterval(id);
    }, [status, startTime]);

    // 에러 발생 시 자동 펼침
    useEffect(() => {
        if (status === 'error') setExpanded(true);
    }, [status]);

    return (
        <div className={`rounded-xl border ${def.ringColor} overflow-hidden`}>
            {/* 헤더 */}
            <div className="flex items-center gap-2 px-3 py-2">
                {status === 'running' ? (
                    <span className="w-2 h-2 flex-shrink-0 rounded-full bg-blue-400 animate-pulse" />
                ) : status === 'done' ? (
                    <CheckCircle2 size={13} className="flex-shrink-0 text-emerald-400" />
                ) : (
                    <XCircle size={13} className="flex-shrink-0 text-red-400" />
                )}

                <span className="text-xs font-mono text-gray-300">{name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${def.badgeColor}`}>
                    {def.badge}
                </span>

                <span className="ml-auto text-[10px] flex items-center gap-1">
                    {status === 'running' && (
                        <span className="text-gray-500 flex items-center gap-1">
                            <Clock size={10} /> {elapsed}s
                        </span>
                    )}
                    {status === 'done' && (
                        <span className="text-emerald-500">{t('toolCompleted')}</span>
                    )}
                    {status === 'error' && (
                        <span className="text-red-500">{t('toolError')}</span>
                    )}
                </span>

                <button
                    onClick={() => setExpanded(p => !p)}
                    className="p-0.5 text-gray-600 hover:text-gray-300 transition-colors"
                >
                    {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
            </div>

            {/* 프롬프트 미리보기 */}
            <div className="px-3 pb-2 border-t border-gray-800/50">
                <p className={`text-[11px] text-gray-500 leading-relaxed mt-1.5 ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-1'}`}>
                    {prompt}
                </p>
            </div>

            {/* Aider 변경 파일 목록 */}
            {aiderFiles.length > 0 && (
                <div className="px-3 pb-2.5 border-t border-gray-800/50">
                    <p className="text-[10px] text-gray-500 mt-1.5 mb-1.5 flex items-center gap-1">
                        <GitBranch size={10} className="text-orange-400" />
                        <span>변경된 파일 {aiderFiles.length}개</span>
                    </p>
                    <div className="space-y-0.5">
                        {aiderFiles.map((f, i) => (
                            <p key={i} className="text-[11px] font-mono text-orange-300 truncate">
                                <span className="text-orange-500/60 mr-1">~</span>{f}
                            </p>
                        ))}
                    </div>
                </div>
            )}

            {/* 전체 출력 (펼침 시) */}
            {expanded && output && (
                <div className="border-t border-gray-800/50">
                    <pre className="text-[11px] text-gray-400 leading-relaxed whitespace-pre-wrap break-words px-3 py-2 max-h-52 overflow-y-auto">
                        {output}
                    </pre>
                </div>
            )}
        </div>
    );
}

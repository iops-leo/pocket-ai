'use client';
import { useState } from 'react';
import { Terminal, FileText, Search, Globe, Wrench, ChevronDown, ChevronRight, Loader2, Check, X, Copy, type LucideIcon } from 'lucide-react';

type ToolStatus = 'running' | 'done' | 'error';

interface ToolCardProps {
    name: string;
    args: string;
    output?: string;
    status: ToolStatus;
    error?: string;
}

const TOOL_ICONS: Record<string, LucideIcon> = {
    Bash: Terminal, Computer: Terminal,
    Read: FileText, Write: FileText, Edit: FileText, MultiEdit: FileText,
    Glob: Search, Grep: Search,
    WebFetch: Globe, WebSearch: Globe,
};

export function ToolCard({ name, args, output, status, error }: ToolCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const Icon = TOOL_ICONS[name] ?? Wrench;
    const hasOutput = (output && output.trim()) || error;

    return (
        <div className="my-1 rounded-lg border border-gray-700/60 bg-gray-900/80 overflow-hidden">
            <button
                onClick={() => hasOutput && setExpanded(!expanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
                disabled={!hasOutput}
            >
                <Icon size={14} className="text-blue-400 flex-shrink-0" />
                <span className="text-xs font-mono text-gray-200 flex-1 truncate">
                    {name}({args})
                </span>
                {status === 'running' && <Loader2 size={12} className="text-yellow-400 animate-spin flex-shrink-0" />}
                {status === 'done' && <Check size={12} className="text-emerald-400 flex-shrink-0" />}
                {status === 'error' && <X size={12} className="text-red-400 flex-shrink-0" />}
                {hasOutput && (expanded
                    ? <ChevronDown size={12} className="text-gray-500 flex-shrink-0" />
                    : <ChevronRight size={12} className="text-gray-500 flex-shrink-0" />
                )}
            </button>

            {expanded && hasOutput && (
                <div className="border-t border-gray-700/60 bg-gray-950/50 max-h-64 overflow-y-auto">
                    <div className="flex justify-end px-3 pt-1.5">
                        <button
                            onClick={async () => {
                                const text = error || output || '';
                                try {
                                    await navigator.clipboard.writeText(text);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 1500);
                                } catch { /* clipboard not available */ }
                            }}
                            className="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                            title="출력 복사"
                        >
                            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            {copied ? '복사됨' : '복사'}
                        </button>
                    </div>
                    <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap break-all px-3 pb-2">
                        {error ? <span className="text-red-400">{error}</span> : output}
                    </pre>
                </div>
            )}
        </div>
    );
}

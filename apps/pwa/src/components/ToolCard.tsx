'use client';
import { useState, useMemo } from 'react';
import { Terminal, FileText, Search, Globe, Wrench, ChevronDown, ChevronRight, Loader2, Check, X, Copy, GitCompare, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DiffView } from './DiffView';

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
    Read: FileText, Write: FileText, Edit: GitCompare, MultiEdit: GitCompare,
    Glob: Search, Grep: Search,
    WebFetch: Globe, WebSearch: Globe,
};

interface EditArgs {
    file_path?: string;
    old_string?: string;
    new_string?: string;
}

/**
 * Parse Edit tool arguments to extract old_string and new_string for diff view
 */
function parseEditArgs(argsJson: string): EditArgs | null {
    try {
        const parsed = JSON.parse(argsJson);
        if (parsed && typeof parsed === 'object') {
            return {
                file_path: parsed.file_path,
                old_string: parsed.old_string,
                new_string: parsed.new_string,
            };
        }
    } catch {
        // Not valid JSON, ignore
    }
    return null;
}

/**
 * Get short filename from path
 */
function getShortPath(filePath: string): string {
    const parts = filePath.split('/');
    return parts.slice(-2).join('/');
}

export function ToolCard({ name, args, output, status, error }: ToolCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const t = useTranslations('common');
    const tc = useTranslations('chat');
    const Icon = TOOL_ICONS[name] ?? Wrench;
    const hasOutput = (output && output.trim()) || error;

    // Parse Edit tool args for diff view
    const editArgs = useMemo(() => {
        if (name === 'Edit' || name === 'MultiEdit') {
            return parseEditArgs(args);
        }
        return null;
    }, [name, args]);

    const isEditTool = editArgs && editArgs.old_string !== undefined && editArgs.new_string !== undefined;

    // For Edit tool, show diff instead of waiting for output
    const showExpandable = isEditTool || hasOutput;

    // Display text for Edit tool
    const displayText = isEditTool && editArgs?.file_path
        ? `${name}(${getShortPath(editArgs.file_path)})`
        : `${name}(${args.length > 50 ? args.slice(0, 47) + '...' : args})`;

    return (
        <div className="my-1 rounded-lg border border-gray-700/60 bg-gray-900/80 overflow-hidden">
            <button
                onClick={() => showExpandable && setExpanded(!expanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
                disabled={!showExpandable}
            >
                <Icon size={14} className={isEditTool ? "text-purple-400" : "text-blue-400"} />
                <span className="text-xs font-mono text-gray-200 flex-1 truncate">
                    {displayText}
                </span>
                {status === 'running' && <Loader2 size={12} className="text-yellow-400 animate-spin flex-shrink-0" />}
                {status === 'done' && <Check size={12} className="text-emerald-400 flex-shrink-0" />}
                {status === 'error' && <X size={12} className="text-red-400 flex-shrink-0" />}
                {showExpandable && (expanded
                    ? <ChevronDown size={12} className="text-gray-500 flex-shrink-0" />
                    : <ChevronRight size={12} className="text-gray-500 flex-shrink-0" />
                )}
            </button>

            {expanded && showExpandable && (
                <div className="border-t border-gray-700/60 bg-gray-950/50 max-h-80 overflow-y-auto">
                    {/* Copy button */}
                    <div className="flex justify-end px-3 pt-1.5">
                        <button
                            onClick={async () => {
                                const text = isEditTool
                                    ? `- ${editArgs?.old_string || ''}\n+ ${editArgs?.new_string || ''}`
                                    : (error || output || '');
                                try {
                                    await navigator.clipboard.writeText(text);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 1500);
                                } catch { /* clipboard not available */ }
                            }}
                            className="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                            title={tc('copyMessage')}
                        >
                            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            {copied ? t('copied') : t('copy')}
                        </button>
                    </div>

                    {/* Content: Diff for Edit tool, plain text for others */}
                    <div className="px-3 pb-2">
                        {isEditTool ? (
                            <DiffView
                                oldText={editArgs?.old_string || ''}
                                newText={editArgs?.new_string || ''}
                                showLineNumbers={true}
                            />
                        ) : (
                            <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap break-all">
                                {error ? <span className="text-red-400">{error}</span> : output}
                            </pre>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

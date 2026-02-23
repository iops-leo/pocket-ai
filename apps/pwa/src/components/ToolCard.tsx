'use client';
import { useState, useMemo, useEffect } from 'react';
import {
    Terminal, FileText, Search, Globe, Wrench, ChevronDown, ChevronRight,
    Loader2, Check, X, Copy, GitCompare, FilePlus, FolderSearch, FileCode,
    type LucideIcon
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DiffView } from './DiffView';
import Prism from 'prismjs';

type ToolStatus = 'running' | 'done' | 'error';

interface ToolCardProps {
    name: string;
    args: string;
    output?: string;
    status: ToolStatus;
    error?: string;
}

// File extension to Prism language mapping
const EXT_TO_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
    java: 'java', kt: 'kotlin', swift: 'swift',
    css: 'css', scss: 'css', less: 'css',
    html: 'markup', xml: 'markup', svg: 'markup',
    json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', mdx: 'markdown',
    sh: 'bash', bash: 'bash', zsh: 'bash',
    sql: 'sql', graphql: 'graphql',
    dockerfile: 'docker', docker: 'docker',
};

// File extension to icon mapping
const EXT_TO_ICON: Record<string, LucideIcon> = {
    ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode,
    py: FileCode, rb: FileCode, go: FileCode, rs: FileCode,
    json: FileText, yaml: FileText, yml: FileText, md: FileText,
    sh: Terminal, bash: Terminal,
};

// Tool to icon mapping
const TOOL_ICONS: Record<string, LucideIcon> = {
    Bash: Terminal, Computer: Terminal,
    Read: FileText, Write: FilePlus, Edit: GitCompare, MultiEdit: GitCompare,
    Glob: FolderSearch, Grep: Search,
    WebFetch: Globe, WebSearch: Globe,
};

// Tool to color mapping
const TOOL_COLORS: Record<string, string> = {
    Bash: 'text-amber-400',
    Read: 'text-blue-400',
    Write: 'text-emerald-400',
    Edit: 'text-purple-400',
    MultiEdit: 'text-purple-400',
    Glob: 'text-cyan-400',
    Grep: 'text-cyan-400',
    WebFetch: 'text-orange-400',
    WebSearch: 'text-orange-400',
};

interface ParsedArgs {
    file_path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
    command?: string;
    pattern?: string;
    path?: string;
}

function parseArgs(argsJson: string): ParsedArgs | null {
    try {
        const parsed = JSON.parse(argsJson);
        if (parsed && typeof parsed === 'object') {
            return parsed as ParsedArgs;
        }
    } catch {
        // Not valid JSON
    }
    return null;
}

function getShortPath(filePath: string): string {
    const parts = filePath.split('/');
    return parts.slice(-2).join('/');
}

function getFileExtension(filePath: string): string {
    const parts = filePath.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function getLanguageFromPath(filePath: string): string {
    const ext = getFileExtension(filePath);
    return EXT_TO_LANG[ext] || 'plaintext';
}

function getIconForFile(filePath: string): LucideIcon {
    const ext = getFileExtension(filePath);
    return EXT_TO_ICON[ext] || FileText;
}

// ============ Tool-specific Views ============

function WriteToolView({ content }: { content: string; filePath?: string }) {
    useEffect(() => {
        Prism.highlightAll();
    }, [content]);

    // Write tool shows all content as "added" (green)
    const lines = content.split('\n');

    return (
        <div className="font-mono text-xs overflow-x-auto">
            {lines.map((line, index) => (
                <div key={index} className="flex bg-emerald-950/40">
                    <span className="w-8 text-right pr-2 text-gray-600 select-none flex-shrink-0">
                        {index + 1}
                    </span>
                    <span className="w-4 text-center select-none flex-shrink-0 text-emerald-400">
                        +
                    </span>
                    <span className="flex-1 whitespace-pre text-emerald-300">
                        {line}
                    </span>
                </div>
            ))}
        </div>
    );
}

function BashToolView({ command, output, error }: { command: string; output?: string; error?: string }) {
    return (
        <div className="font-mono text-xs space-y-2">
            {/* Command */}
            <div className="flex items-start gap-2">
                <span className="text-amber-400 flex-shrink-0">$</span>
                <code className="text-gray-200 whitespace-pre-wrap break-all">{command}</code>
            </div>

            {/* Output */}
            {(output || error) && (
                <div className="border-t border-gray-800 pt-2">
                    {error ? (
                        <pre className="text-red-400 whitespace-pre-wrap break-all">{error}</pre>
                    ) : (
                        <pre className="text-gray-400 whitespace-pre-wrap break-all">{output}</pre>
                    )}
                </div>
            )}
        </div>
    );
}

function ReadToolView({ content, filePath }: { content: string; filePath?: string }) {
    const language = filePath ? getLanguageFromPath(filePath) : 'plaintext';

    useEffect(() => {
        Prism.highlightAll();
    }, [content]);

    return (
        <div className="overflow-x-auto">
            <pre className="text-xs">
                <code className={`language-${language}`}>
                    {content}
                </code>
            </pre>
        </div>
    );
}

function GrepToolView({ pattern, output }: { pattern: string; output?: string }) {
    return (
        <div className="font-mono text-xs space-y-2">
            {/* Pattern */}
            <div className="flex items-center gap-2 text-cyan-400">
                <Search size={12} />
                <code className="text-gray-200">/{pattern}/</code>
            </div>

            {/* Results */}
            {output && (
                <div className="border-t border-gray-800 pt-2">
                    <pre className="text-gray-400 whitespace-pre-wrap break-all">{output}</pre>
                </div>
            )}
        </div>
    );
}

function DefaultToolView({ output, error }: { output?: string; error?: string }) {
    return (
        <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap break-all">
            {error ? <span className="text-red-400">{error}</span> : output}
        </pre>
    );
}

// ============ Main ToolCard Component ============

export function ToolCard({ name, args, output, status, error }: ToolCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const t = useTranslations('common');
    const tc = useTranslations('chat');

    const parsedArgs = useMemo(() => parseArgs(args), [args]);

    // Determine icon and color
    const filePath = parsedArgs?.file_path || parsedArgs?.path;
    const Icon = filePath ? getIconForFile(filePath) : (TOOL_ICONS[name] ?? Wrench);
    const iconColor = TOOL_COLORS[name] || 'text-blue-400';

    // Check tool types
    const isEditTool = (name === 'Edit' || name === 'MultiEdit') &&
        parsedArgs?.old_string !== undefined &&
        parsedArgs?.new_string !== undefined;

    const isWriteTool = name === 'Write' && parsedArgs?.content !== undefined;
    const isBashTool = (name === 'Bash' || name === 'Computer') && parsedArgs?.command !== undefined;
    const isReadTool = name === 'Read' && output;
    const isGrepTool = name === 'Grep' && parsedArgs?.pattern !== undefined;

    // Determine if expandable
    const hasSpecialView = isEditTool || isWriteTool || isBashTool || isReadTool || isGrepTool;
    const hasOutput = (output && output.trim()) || error;
    const showExpandable = hasSpecialView || hasOutput;

    // Generate display text
    let displayText: string;
    if (filePath) {
        displayText = `${name}(${getShortPath(filePath)})`;
    } else if (isBashTool && parsedArgs?.command) {
        const cmd = parsedArgs.command;
        displayText = `${name}(${cmd.length > 40 ? cmd.slice(0, 37) + '...' : cmd})`;
    } else if (isGrepTool && parsedArgs?.pattern) {
        displayText = `${name}(/${parsedArgs.pattern}/)`;
    } else {
        displayText = `${name}(${args.length > 50 ? args.slice(0, 47) + '...' : args})`;
    }

    // Get copy text
    const getCopyText = () => {
        if (isEditTool) {
            return `- ${parsedArgs?.old_string || ''}\n+ ${parsedArgs?.new_string || ''}`;
        }
        if (isWriteTool) {
            return parsedArgs?.content || '';
        }
        if (isBashTool) {
            return `$ ${parsedArgs?.command || ''}\n${output || ''}`;
        }
        return error || output || '';
    };

    return (
        <div className="my-1 rounded-lg border border-gray-700/60 bg-gray-900/80 overflow-hidden">
            <button
                onClick={() => showExpandable && setExpanded(!expanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
                disabled={!showExpandable}
            >
                <Icon size={14} className={`${iconColor} flex-shrink-0`} />
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
                                try {
                                    await navigator.clipboard.writeText(getCopyText());
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

                    {/* Tool-specific content */}
                    <div className="px-3 pb-2">
                        {isEditTool ? (
                            <DiffView
                                oldText={parsedArgs?.old_string || ''}
                                newText={parsedArgs?.new_string || ''}
                                showLineNumbers={true}
                            />
                        ) : isWriteTool ? (
                            <WriteToolView
                                content={parsedArgs?.content || ''}
                                filePath={filePath}
                            />
                        ) : isBashTool ? (
                            <BashToolView
                                command={parsedArgs?.command || ''}
                                output={output}
                                error={error}
                            />
                        ) : isReadTool ? (
                            <ReadToolView
                                content={output || ''}
                                filePath={filePath}
                            />
                        ) : isGrepTool ? (
                            <GrepToolView
                                pattern={parsedArgs?.pattern || ''}
                                output={output}
                            />
                        ) : (
                            <DefaultToolView output={output} error={error} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

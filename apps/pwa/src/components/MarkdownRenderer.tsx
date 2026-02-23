'use client';

import React, { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-diff';
import { Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface MarkdownRendererProps {
    content: string;
}

function CopyCodeButton({ code }: { code: string }) {
    const [copied, setCopied] = useState(false);
    const t = useTranslations('common');

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard not available */
        }
    }, [code]);

    return (
        <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1.5 rounded bg-gray-700/50 hover:bg-gray-600/70 transition-colors text-gray-400 hover:text-gray-200"
            title={t('copy')}
        >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
        </button>
    );
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
    useEffect(() => {
        Prism.highlightAll();
    }, [content]);

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                // Code blocks with syntax highlighting
                code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match && !className;
                    const codeString = String(children).replace(/\n$/, '');

                    if (isInline) {
                        return (
                            <code
                                className="px-1.5 py-0.5 rounded bg-gray-700/60 text-orange-300 text-[13px] font-mono"
                                {...props}
                            >
                                {children}
                            </code>
                        );
                    }

                    const language = match ? match[1] : '';

                    return (
                        <div className="relative group my-3">
                            {language && (
                                <div className="absolute top-0 left-0 px-2 py-0.5 text-[10px] text-gray-500 font-mono uppercase tracking-wider">
                                    {language}
                                </div>
                            )}
                            <CopyCodeButton code={codeString} />
                            <pre className={`overflow-x-auto rounded-lg bg-gray-800/90 border border-gray-700/50 p-3 pt-6 ${language ? 'pt-7' : 'pt-3'}`}>
                                <code className={`language-${language} text-[13px] leading-relaxed font-mono`}>
                                    {codeString}
                                </code>
                            </pre>
                        </div>
                    );
                },
                // Paragraphs
                p({ children }) {
                    return <p className="mb-2 last:mb-0">{children}</p>;
                },
                // Headers
                h1({ children }) {
                    return <h1 className="text-lg font-bold mb-2 mt-3 text-white">{children}</h1>;
                },
                h2({ children }) {
                    return <h2 className="text-base font-semibold mb-2 mt-3 text-white">{children}</h2>;
                },
                h3({ children }) {
                    return <h3 className="text-sm font-semibold mb-1.5 mt-2 text-white">{children}</h3>;
                },
                // Lists
                ul({ children }) {
                    return <ul className="list-disc list-inside mb-2 space-y-0.5 text-gray-200">{children}</ul>;
                },
                ol({ children }) {
                    return <ol className="list-decimal list-inside mb-2 space-y-0.5 text-gray-200">{children}</ol>;
                },
                li({ children }) {
                    return <li className="text-gray-200">{children}</li>;
                },
                // Links
                a({ href, children }) {
                    return (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                        >
                            {children}
                        </a>
                    );
                },
                // Blockquotes
                blockquote({ children }) {
                    return (
                        <blockquote className="border-l-2 border-gray-600 pl-3 my-2 text-gray-400 italic">
                            {children}
                        </blockquote>
                    );
                },
                // Tables
                table({ children }) {
                    return (
                        <div className="overflow-x-auto my-2">
                            <table className="min-w-full text-sm border border-gray-700 rounded">
                                {children}
                            </table>
                        </div>
                    );
                },
                thead({ children }) {
                    return <thead className="bg-gray-800">{children}</thead>;
                },
                th({ children }) {
                    return <th className="px-3 py-1.5 text-left text-gray-300 font-medium border-b border-gray-700">{children}</th>;
                },
                td({ children }) {
                    return <td className="px-3 py-1.5 text-gray-300 border-b border-gray-800">{children}</td>;
                },
                // Horizontal rule
                hr() {
                    return <hr className="border-gray-700 my-3" />;
                },
                // Strong/Bold
                strong({ children }) {
                    return <strong className="font-semibold text-white">{children}</strong>;
                },
                // Emphasis/Italic
                em({ children }) {
                    return <em className="italic text-gray-300">{children}</em>;
                },
            }}
        >
            {content}
        </ReactMarkdown>
    );
}

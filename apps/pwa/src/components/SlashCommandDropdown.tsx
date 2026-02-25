'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Command, Plug, FolderOpen } from 'lucide-react';

export interface SlashCommand {
    name: string;
    source: 'global' | 'plugin' | 'project';
}

interface SlashCommandDropdownProps {
    commands: SlashCommand[];
    inputValue: string;
    onSelect: (command: string) => void;
    onClose: () => void;
    visible: boolean;
}

function getSourceIcon(source: SlashCommand['source']) {
    switch (source) {
        case 'global': return <Command size={12} className="text-blue-400" />;
        case 'plugin': return <Plug size={12} className="text-purple-400" />;
        case 'project': return <FolderOpen size={12} className="text-emerald-400" />;
    }
}

function getSourceLabel(source: SlashCommand['source']) {
    switch (source) {
        case 'global': return 'Global';
        case 'plugin': return 'Plugin';
        case 'project': return 'Project';
    }
}

export function SlashCommandDropdown({
    commands,
    inputValue,
    onSelect,
    onClose,
    visible,
}: SlashCommandDropdownProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    // "/" 이후의 텍스트로 필터링
    const query = inputValue.startsWith('/') ? inputValue.slice(1).toLowerCase() : '';
    const filtered = query
        ? commands.filter(cmd => cmd.name.toLowerCase().includes(query))
        : commands;

    // 필터 변경 시 선택 초기화
    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    // 선택 항목이 보이도록 스크롤
    useEffect(() => {
        if (!listRef.current) return;
        const selected = listRef.current.children[selectedIndex] as HTMLElement;
        if (selected) {
            selected.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!visible || filtered.length === 0) return;

        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
                break;
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % filtered.length);
                break;
            case 'Tab':
                e.preventDefault();
                if (filtered[selectedIndex]) {
                    onSelect('/' + filtered[selectedIndex].name);
                }
                break;
            case 'Enter':
                if (!e.shiftKey && !e.isComposing) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (filtered[selectedIndex]) {
                        onSelect('/' + filtered[selectedIndex].name);
                    }
                }
                break;
            case 'Escape':
                e.preventDefault();
                onClose();
                break;
        }
    }, [visible, filtered, selectedIndex, onSelect, onClose]);

    useEffect(() => {
        if (visible) {
            document.addEventListener('keydown', handleKeyDown, true);
            return () => document.removeEventListener('keydown', handleKeyDown, true);
        }
    }, [visible, handleKeyDown]);

    if (!visible || filtered.length === 0) return null;

    return (
        <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 z-30">
            <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden max-w-3xl mx-auto">
                {/* Header */}
                <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2">
                    <Command size={14} className="text-gray-500" />
                    <span className="text-xs text-gray-400 font-medium">
                        슬래시 명령어
                    </span>
                    <span className="text-xs text-gray-600 ml-auto">
                        ↑↓ 이동 · Tab/Enter 선택 · Esc 닫기
                    </span>
                </div>

                {/* Command list */}
                <div ref={listRef} className="max-h-48 overflow-y-auto py-1">
                    {filtered.map((cmd, i) => (
                        <button
                            key={`${cmd.source}-${cmd.name}`}
                            onClick={() => onSelect('/' + cmd.name)}
                            className={`w-full px-3 py-2 flex items-center gap-2.5 text-left transition-colors ${i === selectedIndex
                                    ? 'bg-blue-600/20 text-white'
                                    : 'text-gray-300 hover:bg-gray-800'
                                }`}
                        >
                            {getSourceIcon(cmd.source)}
                            <span className="font-mono text-sm">/{cmd.name}</span>
                            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border ${cmd.source === 'project'
                                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                                    : cmd.source === 'plugin'
                                        ? 'text-purple-400 border-purple-500/30 bg-purple-500/10'
                                        : 'text-gray-500 border-gray-700 bg-gray-800'
                                }`}>
                                {getSourceLabel(cmd.source)}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

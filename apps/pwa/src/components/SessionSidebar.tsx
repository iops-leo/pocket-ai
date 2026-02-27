'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Plus, ChevronLeft, FolderOpen, Settings, Trash2, Pencil, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface Session {
    sessionId: string;
    publicKey: string;
    metadata: {
        sessionName?: string;
        hostname?: string;
        engine?: string;
        cwd?: string;
    };
    status: string;
    lastPing?: number;
}

interface SessionSidebarProps {
    sessions: Session[];
    activeSessionId: string | null;
    onSelectSession: (sessionId: string) => void;
    onDeleteSession: (sessionId: string) => void;
    onRenameSession: (sessionId: string, sessionName: string) => void;
    onNewSession: () => void;
    onRefresh?: () => void;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

function getShortPath(cwd?: string): string {
    if (!cwd) return '';
    const parts = cwd.split('/');
    return parts.slice(-2).join('/');
}

function getEngineBadgeClass(engine?: string): string {
    switch (engine?.toLowerCase()) {
        case 'claude': return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
        case 'gemini': return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
        case 'codex': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
        default: return 'bg-gray-500/15 text-gray-300 border-gray-500/30';
    }
}

function getEngineLabel(engine?: string): string {
    if (!engine) return 'Unknown';
    const normalized = engine.toLowerCase();
    if (normalized === 'claude') return 'Claude';
    if (normalized === 'gemini') return 'Gemini';
    if (normalized === 'codex') return 'Codex';
    return engine;
}

export function SessionSidebar({
    sessions,
    activeSessionId,
    onSelectSession,
    onDeleteSession,
    onRenameSession,
    onNewSession,
    onRefresh,
    isCollapsed = false,
    onToggleCollapse,
}: SessionSidebarProps) {
    const t = useTranslations('dashboard');
    const [searchQuery, setSearchQuery] = useState('');
    const [engineFilter, setEngineFilter] = useState<string>('all');
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        if (!onRefresh || isRefreshing) return;
        setIsRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setTimeout(() => setIsRefreshing(false), 500);
        }
    };

    const filteredSessions = sessions.filter(session => {
        const matchesSearch = session.metadata?.sessionName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            session.metadata?.hostname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            session.sessionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
            session.metadata?.cwd?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesEngine = engineFilter === 'all' || session.metadata?.engine?.toLowerCase() === engineFilter.toLowerCase();
        return matchesSearch && matchesEngine;
    });

    // Group by online/offline (서버가 createdAt DESC로 이미 정렬해서 반환)
    const onlineSessions = filteredSessions.filter(s => s.status === 'online');
    const offlineSessions = filteredSessions.filter(s => s.status !== 'online');

    if (isCollapsed) {
        return (
            <div className="w-16 h-full bg-gray-900 border-r border-gray-800 flex flex-col items-center py-4 gap-3">
                <button
                    onClick={onToggleCollapse}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    title="Expand sidebar"
                >
                    <ChevronLeft size={20} className="rotate-180" />
                </button>

                {onRefresh && (
                    <button
                        onClick={handleRefresh}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                        title={t('refresh')}
                    >
                        <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                    </button>
                )}

                <div className="w-8 h-px bg-gray-800 my-1" />

                {/* Collapsed session indicators */}
                {onlineSessions.slice(0, 5).map(session => (
                    <button
                        key={session.sessionId}
                        onClick={() => onSelectSession(session.sessionId)}
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 outline-none shadow-sm ${activeSessionId === session.sessionId
                            ? 'bg-blue-600 text-white ring-2 ring-blue-500/50 shadow-blue-900/40'
                            : 'bg-gray-800/80 text-gray-400 border border-gray-700/50 hover:bg-gray-700 hover:text-white'
                            }`}
                        title={session.metadata?.sessionName || session.metadata?.hostname || session.sessionId.slice(0, 8)}
                    >
                        <span className="text-sm font-bold tracking-wider">
                            {(session.metadata?.sessionName || session.metadata?.hostname || session.sessionId).slice(0, 2).toUpperCase()}
                        </span>
                    </button>
                ))}

                {onlineSessions.length > 5 && (
                    <span className="text-xs text-gray-500">+{onlineSessions.length - 5}</span>
                )}

                <div className="flex-1" />

                <button
                    onClick={onNewSession}
                    className="p-2 text-gray-400 hover:text-emerald-400 hover:bg-gray-800 rounded-lg transition-colors"
                    title={t('newSession')}
                >
                    <Plus size={20} />
                </button>

                <Link
                    href="/settings"
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    title={t('settings')}
                >
                    <Settings size={20} />
                </Link>
            </div>
        );
    }

    return (
        <div className="w-72 h-full bg-gray-900 border-r border-gray-800 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-800/80 bg-gray-900/40">
                <div className="flex items-center justify-between mb-5">
                    <h1 className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 drop-shadow-sm">
                        Pocket AI
                    </h1>
                    <div className="flex items-center gap-1">
                        {onRefresh && (
                            <button
                                onClick={handleRefresh}
                                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                                title={t('refresh')}
                            >
                                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                            </button>
                        )}
                        <button
                            onClick={onToggleCollapse}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors lg:flex hidden"
                            title="Collapse sidebar"
                        >
                            <ChevronLeft size={18} />
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="relative group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={15} />
                    <input
                        type="text"
                        placeholder={t('searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-950/50 border border-gray-800/80 rounded-xl text-sm text-gray-200 placeholder-gray-500/70 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all shadow-inner"
                    />
                </div>

                {/* Engine Filter */}
                <div className="flex p-1 mt-4 bg-gray-950/60 rounded-xl border border-gray-800/60">
                    {['all', 'claude', 'gemini', 'codex'].map(engine => (
                        <button
                            key={engine}
                            onClick={() => setEngineFilter(engine)}
                            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${engineFilter === engine
                                ? 'bg-gray-800 text-white shadow-sm ring-1 ring-gray-700'
                                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                                }`}
                        >
                            {engine === 'all' ? t('allEngines') : engine.charAt(0).toUpperCase() + engine.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-3 space-y-6 custom-scrollbar">
                {/* Online Sessions */}
                {onlineSessions.length > 0 && (
                    <div className="space-y-1.5">
                        <div className="px-3 py-1 text-[11px] font-semibold text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                            {t('online')} <span className="text-gray-600 font-medium">({onlineSessions.length})</span>
                        </div>
                        {onlineSessions.map(session => (
                            <SessionItem
                                key={session.sessionId}
                                session={session}
                                isActive={activeSessionId === session.sessionId}
                                onClick={() => onSelectSession(session.sessionId)}
                                onDelete={() => onDeleteSession(session.sessionId)}
                                onRename={(name) => onRenameSession(session.sessionId, name)}
                            />
                        ))}
                    </div>
                )}

                {/* Offline Sessions */}
                {offlineSessions.length > 0 && (
                    <div className="space-y-1.5">
                        <div className="px-3 py-1 text-[11px] font-semibold text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-2 opacity-80">
                            <span className="w-1.5 h-1.5 bg-gray-600 rounded-full" />
                            {t('offline')} <span className="text-gray-600 font-medium">({offlineSessions.length})</span>
                        </div>
                        {offlineSessions.map(session => (
                            <SessionItem
                                key={session.sessionId}
                                session={session}
                                isActive={activeSessionId === session.sessionId}
                                onClick={() => onSelectSession(session.sessionId)}
                                onDelete={() => onDeleteSession(session.sessionId)}
                                onRename={(name) => onRenameSession(session.sessionId, name)}
                                disabled
                            />
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {filteredSessions.length === 0 && (
                    <div className="p-6 text-center">
                        <p className="text-gray-500 text-sm">{t('noSessions')}</p>
                        <p className="text-gray-600 text-xs mt-1">
                            {t('noSessionsHint', { command: 'pocket-ai' })}
                        </p>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800/80 bg-gray-900/40 mt-auto">
                <button
                    onClick={onNewSession}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium text-sm transition-all shadow-lg active:scale-[0.98]"
                >
                    <Plus size={16} strokeWidth={2.5} />
                    {t('newSession')}
                </button>

                <Link
                    href="/settings"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 mt-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl text-sm font-medium transition-all"
                >
                    <Settings size={16} />
                    {t('settings')}
                </Link>
            </div>
        </div>
    );
}

// Individual session item
function SessionItem({
    session,
    isActive,
    onClick,
    onDelete,
    onRename,
    disabled = false,
}: {
    session: Session;
    isActive: boolean;
    onClick: () => void;
    onDelete: () => void;
    onRename: (name: string) => void;
    disabled?: boolean;
}) {
    const t = useTranslations('dashboard');
    const [showConfirm, setShowConfirm] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const editInputRef = useRef<HTMLInputElement>(null);
    const isOnline = session.status === 'online';
    const shortPath = getShortPath(session.metadata?.cwd);
    const displayName = session.metadata?.sessionName || session.metadata?.hostname || 'Unknown Host';

    useEffect(() => {
        if (isEditing) editInputRef.current?.focus();
    }, [isEditing]);

    return (
        <div className="relative group">
            <button
                onClick={onClick}
                disabled={disabled}
                className={`w-full px-3 py-2.5 flex items-start gap-3 rounded-xl transition-all duration-200 outline-none ${isActive
                    ? 'bg-blue-500/10 ring-1 ring-blue-500/30 text-white'
                    : disabled
                        ? 'opacity-40 cursor-not-allowed text-gray-400'
                        : 'hover:bg-gray-800/60 text-gray-300 hover:text-white border border-transparent'
                    }`}
            >
                {/* Status indicator */}
                <div className="flex-shrink-0 mt-[4px]">
                    <div className={`w-2 h-2 rounded-full ${isOnline ? (isActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.4)]') : 'bg-gray-600'}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                        {isEditing ? (
                            <input
                                ref={editInputRef}
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const trimmed = editValue.trim();
                                        if (trimmed && trimmed !== displayName) onRename(trimmed);
                                        setIsEditing(false);
                                    } else if (e.key === 'Escape') {
                                        setIsEditing(false);
                                    }
                                }}
                                onBlur={() => setIsEditing(false)}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-gray-950 text-white text-sm font-semibold rounded-md px-2 py-0.5 w-full border border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 shadow-inner"
                            />
                        ) : (
                            <span className="font-semibold text-[13px] truncate tracking-wide">
                                {displayName}
                            </span>
                        )}
                        <span
                            className={`px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded-md border flex-shrink-0 ${getEngineBadgeClass(session.metadata?.engine)}`}
                            title={`Engine: ${getEngineLabel(session.metadata?.engine)}`}
                        >
                            {getEngineLabel(session.metadata?.engine)}
                        </span>
                    </div>

                    {shortPath && (
                        <div className={`flex items-center gap-1.5 mt-1 text-[11px] truncate ${isActive ? 'text-blue-200/70' : 'text-gray-500'}`}>
                            <FolderOpen size={11} className="flex-shrink-0" />
                            <span className="truncate font-mono">{shortPath}</span>
                        </div>
                    )}

                    <div className={`text-[10px] mt-1 font-mono uppercase tracking-wider ${isActive ? 'text-blue-300/50' : 'text-gray-600'}`}>
                        {session.sessionId.slice(0, 8)}
                    </div>
                </div>
            </button>

            {!showConfirm && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setEditValue(displayName);
                        setIsEditing(true);
                    }}
                    className="absolute right-8 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-600 hover:text-blue-300 hover:bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-all"
                    title={t('renameSession')}
                >
                    <Pencil size={14} />
                </button>
            )}

            {/* Delete button - appears on hover */}
            {!showConfirm && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowConfirm(true);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                    title={t('deleteSession')}
                >
                    <Trash2 size={14} />
                </button>
            )}

            {/* Delete confirmation */}
            {showConfirm && (
                <div className="absolute inset-0 bg-gray-900/95 flex items-center justify-center gap-2 px-3 z-10">
                    <span className="text-xs text-gray-300 flex-1 truncate">{t('deleteSessionConfirm')}</span>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowConfirm(false);
                            onDelete();
                        }}
                        className="px-2.5 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded-md font-medium transition-colors flex-shrink-0"
                    >
                        {t('deleteSession')}
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowConfirm(false);
                        }}
                        className="px-2.5 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md font-medium transition-colors flex-shrink-0"
                    >
                        {t('cancel')}
                    </button>
                </div>
            )}
        </div>
    );
}

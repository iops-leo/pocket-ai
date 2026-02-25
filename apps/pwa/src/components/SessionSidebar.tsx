'use client';

import { useState } from 'react';
import { Search, Plus, ChevronLeft, FolderOpen, Settings, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface Session {
    sessionId: string;
    publicKey: string;
    metadata: {
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
    onNewSession: () => void;
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
    onNewSession,
    isCollapsed = false,
    onToggleCollapse,
}: SessionSidebarProps) {
    const t = useTranslations('dashboard');
    const [searchQuery, setSearchQuery] = useState('');
    const [engineFilter, setEngineFilter] = useState<string>('all');

    const filteredSessions = sessions.filter(session => {
        const matchesSearch = session.metadata?.hostname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            session.sessionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
            session.metadata?.cwd?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesEngine = engineFilter === 'all' || session.metadata?.engine?.toLowerCase() === engineFilter.toLowerCase();
        return matchesSearch && matchesEngine;
    });

    // Group by online/offline
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

                <div className="w-8 h-px bg-gray-800 my-1" />

                {/* Collapsed session indicators */}
                {onlineSessions.slice(0, 5).map(session => (
                    <button
                        key={session.sessionId}
                        onClick={() => onSelectSession(session.sessionId)}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${activeSessionId === session.sessionId
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                            }`}
                        title={session.metadata?.hostname || session.sessionId.slice(0, 8)}
                    >
                        <span className="text-xs font-mono font-bold">
                            {(session.metadata?.hostname || session.sessionId).slice(0, 2).toUpperCase()}
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
            <div className="p-4 border-b border-gray-800">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                        Pocket AI
                    </h1>
                    <button
                        onClick={onToggleCollapse}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors lg:flex hidden"
                        title="Collapse sidebar"
                    >
                        <ChevronLeft size={18} />
                    </button>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                    <input
                        type="text"
                        placeholder={t('searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-all"
                    />
                </div>

                {/* Engine Filter */}
                <div className="flex gap-1 mt-3">
                    {['all', 'claude', 'gemini', 'codex'].map(engine => (
                        <button
                            key={engine}
                            onClick={() => setEngineFilter(engine)}
                            className={`flex-1 px-2 py-1.5 text-xs rounded-md transition-colors ${engineFilter === engine
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                        >
                            {engine === 'all' ? t('allEngines') : engine.charAt(0).toUpperCase() + engine.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto">
                {/* Online Sessions */}
                {onlineSessions.length > 0 && (
                    <div className="py-2">
                        <div className="px-4 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            {t('online')} ({onlineSessions.length})
                        </div>
                        {onlineSessions.map(session => (
                            <SessionItem
                                key={session.sessionId}
                                session={session}
                                isActive={activeSessionId === session.sessionId}
                                onClick={() => onSelectSession(session.sessionId)}
                                onDelete={() => onDeleteSession(session.sessionId)}
                            />
                        ))}
                    </div>
                )}

                {/* Offline Sessions */}
                {offlineSessions.length > 0 && (
                    <div className="py-2">
                        <div className="px-4 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-2 h-2 bg-gray-600 rounded-full" />
                            {t('offline')} ({offlineSessions.length})
                        </div>
                        {offlineSessions.map(session => (
                            <SessionItem
                                key={session.sessionId}
                                session={session}
                                isActive={activeSessionId === session.sessionId}
                                onClick={() => onSelectSession(session.sessionId)}
                                onDelete={() => onDeleteSession(session.sessionId)}
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
            <div className="p-3 border-t border-gray-800">
                <button
                    onClick={onNewSession}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-sm transition-colors"
                >
                    <Plus size={16} />
                    {t('newSession')}
                </button>

                <Link
                    href="/settings"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 mt-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg text-sm transition-colors"
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
    disabled = false,
}: {
    session: Session;
    isActive: boolean;
    onClick: () => void;
    onDelete: () => void;
    disabled?: boolean;
}) {
    const t = useTranslations('dashboard');
    const [showConfirm, setShowConfirm] = useState(false);
    const isOnline = session.status === 'online';
    const shortPath = getShortPath(session.metadata?.cwd);

    return (
        <div className="relative group">
            <button
                onClick={onClick}
                disabled={disabled}
                className={`w-full px-4 py-3 flex items-start gap-3 transition-all ${isActive
                        ? 'bg-blue-600/20 border-l-2 border-blue-500'
                        : disabled
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-gray-800/50 border-l-2 border-transparent'
                    }`}
            >
                {/* Status indicator */}
                <div className="flex-shrink-0 mt-1">
                    <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-gray-600'}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-white truncate">
                            {session.metadata?.hostname || 'Unknown Host'}
                        </span>
                        <span
                            className={`px-1.5 py-0.5 text-[10px] rounded-md border font-medium flex-shrink-0 ${getEngineBadgeClass(session.metadata?.engine)}`}
                            title={`Engine: ${getEngineLabel(session.metadata?.engine)}`}
                        >
                            {getEngineLabel(session.metadata?.engine)}
                        </span>
                    </div>

                    {shortPath && (
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500 truncate">
                            <FolderOpen size={10} className="flex-shrink-0" />
                            <span className="truncate font-mono">{shortPath}</span>
                        </div>
                    )}

                    <div className="text-xs text-gray-600 mt-0.5 font-mono">
                        {session.sessionId.slice(0, 8)}
                    </div>
                </div>
            </button>

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

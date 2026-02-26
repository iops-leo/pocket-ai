'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, FolderOpen, Cpu, Terminal, Loader2, Pin, PinOff, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface RecentPathItem {
    path: string;
    engine?: string;
    lastUsedAt?: string;
    useCount?: number;
}

interface NewSessionModalProps {
    onClose: () => void;
    onSubmit: (data: { cwd: string; engine: string; sessionName?: string }) => Promise<void>;
    recentPaths?: RecentPathItem[];
    enabledEngines?: string[];
}

const ENGINES = [
    { id: 'claude', name: 'Claude', color: 'bg-orange-500' },
    { id: 'gemini', name: 'Gemini', color: 'bg-blue-500' },
    { id: 'codex', name: 'Codex', color: 'bg-emerald-500' },
];

const QUICK_PATHS = [
    { label: '~', path: '~' },
    { label: '~/project', path: '~/project' },
    { label: '~/Desktop', path: '~/Desktop' },
    { label: '현재 위치', path: '.' },
];

const RECENT_PATH_PINS_KEY = 'pocket_ai_recent_path_pins';
const RECENT_PATH_HIDDEN_KEY = 'pocket_ai_recent_path_hidden';

export function NewSessionModal({ onClose, onSubmit, recentPaths = [], enabledEngines }: NewSessionModalProps) {
    const t = useTranslations('dashboard');
    const tc = useTranslations('common');
    const [cwd, setCwd] = useState('');
    const [sessionName, setSessionName] = useState('');
    const [engine, setEngine] = useState('claude');
    const [recentEngineFilter, setRecentEngineFilter] = useState('all');
    const [pinnedPaths, setPinnedPaths] = useState<string[]>([]);
    const [hiddenPaths, setHiddenPaths] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const enabledEngineSet = useMemo(() => {
        const source = enabledEngines ?? ENGINES.map(item => item.id);
        return new Set(source.map(item => item.trim().toLowerCase()));
    }, [enabledEngines]);

    useEffect(() => {
        if (enabledEngineSet.has(engine)) return;
        const nextEnabled = ENGINES.find(item => enabledEngineSet.has(item.id))?.id;
        if (nextEnabled) {
            setEngine(nextEnabled);
        }
    }, [enabledEngineSet, engine]);

    useEffect(() => {
        try {
            const savedPins = localStorage.getItem(RECENT_PATH_PINS_KEY);
            if (savedPins) {
                const parsed = JSON.parse(savedPins);
                if (Array.isArray(parsed)) {
                    setPinnedPaths(parsed.filter((v): v is string => typeof v === 'string'));
                }
            }
            const savedHidden = localStorage.getItem(RECENT_PATH_HIDDEN_KEY);
            if (savedHidden) {
                const parsed = JSON.parse(savedHidden);
                if (Array.isArray(parsed)) {
                    setHiddenPaths(parsed.filter((v): v is string => typeof v === 'string'));
                }
            }
        } catch {
            // ignore parsing/storage errors
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(RECENT_PATH_PINS_KEY, JSON.stringify(pinnedPaths));
    }, [pinnedPaths]);

    useEffect(() => {
        localStorage.setItem(RECENT_PATH_HIDDEN_KEY, JSON.stringify(hiddenPaths));
    }, [hiddenPaths]);

    // 포커스 트랩 + Escape 닫기
    useEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;

        // 모달 마운트 시 첫 번째 포커스 가능 요소에 포커스
        const focusable = panel.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        focusable[0]?.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
            }
            if (e.key !== 'Tab') return;

            const elements = panel.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (elements.length === 0) return;

            const first = elements[0];
            const last = elements[elements.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const availableRecentEngines = useMemo(() => {
        return Array.from(new Set(recentPaths.map(path => path.engine).filter(Boolean))) as string[];
    }, [recentPaths]);

    const visibleRecentPaths = useMemo(() => {
        return recentPaths
            .filter(item => !hiddenPaths.includes(item.path))
            .filter(item => recentEngineFilter === 'all' ? true : item.engine === recentEngineFilter)
            .sort((a, b) => {
                const aPinned = pinnedPaths.includes(a.path);
                const bPinned = pinnedPaths.includes(b.path);
                if (aPinned !== bPinned) return aPinned ? -1 : 1;

                const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
                const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
                return bTime - aTime;
            });
    }, [hiddenPaths, pinnedPaths, recentEngineFilter, recentPaths]);

    const togglePinPath = (path: string) => {
        setPinnedPaths(prev => prev.includes(path) ? prev.filter(item => item !== path) : [path, ...prev]);
    };

    const hidePath = (path: string) => {
        setHiddenPaths(prev => prev.includes(path) ? prev : [path, ...prev]);
        setPinnedPaths(prev => prev.filter(item => item !== path));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cwd.trim()) {
            setError(t('pathRequired'));
            return;
        }
        if (!enabledEngineSet.has(engine)) {
            setError(t('engineNotOnline'));
            return;
        }

        setError(null);
        setIsSubmitting(true);
        try {
            await onSubmit({
                cwd: cwd.trim(),
                engine,
                sessionName: sessionName.trim() || undefined,
            });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('createFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-session-modal-title"
        >
            <div ref={panelRef} className="w-full max-w-md bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-800">
                    <h2 id="new-session-modal-title" className="text-lg font-semibold text-white flex items-center gap-2">
                        <Terminal size={20} className="text-blue-400" />
                        {t('newSession')}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-5 space-y-5">
                    {/* Session Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            {t('sessionName')}
                        </label>
                        <input
                            type="text"
                            value={sessionName}
                            onChange={(e) => setSessionName(e.target.value)}
                            placeholder={t('sessionNamePlaceholder')}
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                    </div>

                    {/* Working Directory */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            <FolderOpen size={14} className="inline mr-1.5" />
                            {t('workingDirectory')}
                        </label>
                        <input
                            type="text"
                            value={cwd}
                            onChange={(e) => setCwd(e.target.value)}
                            placeholder="/path/to/project"
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                        />

                        {/* Quick paths */}
                        <div className="flex flex-wrap gap-2 mt-2">
                            {QUICK_PATHS.map(qp => (
                                <button
                                    key={qp.path}
                                    type="button"
                                    onClick={() => setCwd(qp.path)}
                                    className="px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-md transition-colors font-mono"
                                >
                                    {qp.label}
                                </button>
                            ))}
                        </div>

                        {recentPaths.length > 0 && (
                            <div className="mt-3">
                                <p className="text-xs text-gray-500 mb-2">{t('recentPaths')}</p>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    <button
                                        type="button"
                                        onClick={() => setRecentEngineFilter('all')}
                                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${recentEngineFilter === 'all'
                                            ? 'bg-gray-700 text-white border-gray-600'
                                            : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
                                            }`}
                                    >
                                        {t('recentPathsAll')}
                                    </button>
                                    {availableRecentEngines.map(eng => (
                                        <button
                                            key={eng}
                                            type="button"
                                            onClick={() => setRecentEngineFilter(eng)}
                                            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${recentEngineFilter === eng
                                                ? 'bg-blue-900/50 text-blue-100 border-blue-700'
                                                : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
                                                }`}
                                        >
                                            {eng}
                                        </button>
                                    ))}
                                </div>

                                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                                    {visibleRecentPaths.length === 0 && (
                                        <p className="text-xs text-gray-500">{t('recentPathsEmpty')}</p>
                                    )}
                                    {visibleRecentPaths.map(item => {
                                        const isPinned = pinnedPaths.includes(item.path);
                                        return (
                                            <div
                                                key={item.path}
                                                className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/70 border border-gray-700/60"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setCwd(item.path)}
                                                    className="flex-1 text-left min-w-0"
                                                    title={item.path}
                                                >
                                                    <p className="text-xs text-gray-100 font-mono truncate">{item.path}</p>
                                                    <p className="text-[11px] text-gray-500 truncate">
                                                        {item.engine || 'unknown'}
                                                        {typeof item.useCount === 'number' ? ` · ${item.useCount}` : ''}
                                                    </p>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => togglePinPath(item.path)}
                                                    className="p-1.5 rounded-md text-gray-400 hover:text-yellow-300 hover:bg-gray-700 transition-colors"
                                                    title={isPinned ? t('unpinPath') : t('pinPath')}
                                                >
                                                    {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => hidePath(item.path)}
                                                    className="p-1.5 rounded-md text-gray-400 hover:text-red-300 hover:bg-gray-700 transition-colors"
                                                    title={t('removePath')}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Engine Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            <Cpu size={14} className="inline mr-1.5" />
                            {t('engine')}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {ENGINES.map(eng => (
                                <button
                                    key={eng.id}
                                    type="button"
                                    onClick={() => {
                                        if (!enabledEngineSet.has(eng.id)) return;
                                        setEngine(eng.id);
                                    }}
                                    disabled={!enabledEngineSet.has(eng.id)}
                                    className={`p-3 rounded-xl border text-center transition-all ${
                                        !enabledEngineSet.has(eng.id)
                                            ? 'border-gray-800 bg-gray-900 text-gray-600 cursor-not-allowed opacity-50'
                                            : engine === eng.id
                                            ? 'border-blue-500 bg-blue-600/20'
                                            : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                                    }`}
                                >
                                    <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${eng.color}`} />
                                    <div className={`text-sm font-medium ${enabledEngineSet.has(eng.id) ? 'text-white' : 'text-gray-500'}`}>
                                        {eng.name}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-2">
                            {t('engineOnlineOnly')}
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Info */}
                    <div className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-400 text-xs">
                        <p className="mb-1">💡 {t('newSessionHint1')}</p>
                        <p className="font-mono text-gray-500">pocket-ai --cwd /path/to/project</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium text-sm transition-colors"
                        >
                            {tc('cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || enabledEngineSet.size === 0}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm transition-colors"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    {t('creating')}
                                </>
                            ) : (
                                t('createSession')
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

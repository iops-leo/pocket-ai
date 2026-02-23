'use client';

import { useState } from 'react';
import { X, FolderOpen, Cpu, Terminal, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface NewSessionModalProps {
    onClose: () => void;
    onSubmit: (data: { cwd: string; engine: string }) => Promise<void>;
}

const ENGINES = [
    { id: 'claude', name: 'Claude', color: 'bg-orange-500', description: 'Anthropic Claude CLI' },
    { id: 'gemini', name: 'Gemini', color: 'bg-blue-500', description: 'Google Gemini CLI' },
    { id: 'codex', name: 'Codex', color: 'bg-emerald-500', description: 'OpenAI Codex CLI' },
];

const QUICK_PATHS = [
    { label: '~', path: '~' },
    { label: '~/project', path: '~/project' },
    { label: '~/Desktop', path: '~/Desktop' },
    { label: '현재 위치', path: '.' },
];

export function NewSessionModal({ onClose, onSubmit }: NewSessionModalProps) {
    const t = useTranslations('dashboard');
    const tc = useTranslations('common');
    const [cwd, setCwd] = useState('');
    const [engine, setEngine] = useState('claude');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cwd.trim()) {
            setError(t('pathRequired'));
            return;
        }

        setError(null);
        setIsSubmitting(true);
        try {
            await onSubmit({ cwd: cwd.trim(), engine });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('createFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-800">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
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
                                    onClick={() => setEngine(eng.id)}
                                    className={`p-3 rounded-xl border text-center transition-all ${
                                        engine === eng.id
                                            ? 'border-blue-500 bg-blue-600/20'
                                            : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                                    }`}
                                >
                                    <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${eng.color}`} />
                                    <div className="text-sm font-medium text-white">{eng.name}</div>
                                    <div className="text-xs text-gray-500 mt-0.5 hidden sm:block">{eng.description}</div>
                                </button>
                            ))}
                        </div>
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
                            disabled={isSubmitting}
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

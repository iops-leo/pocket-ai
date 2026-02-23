'use client';

import { useState, useEffect } from 'react';
import { Copy, User, LogOut, Loader2, Check, ArrowLeft, Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useLocale } from '@/i18n/client';

export default function SettingsPage() {
    const router = useRouter();
    const t = useTranslations('settings');
    const tc = useTranslations('common');
    const [locale, setLocale] = useLocale();
    const [token, setToken] = useState<string | null>(null);
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        const storedToken = localStorage.getItem('pocket_ai_token');
        if (!storedToken) {
            router.replace('/login');
            return;
        }
        setToken(storedToken);
    }, [router]);

    const handleCopy = async () => {
        if (token) {
            await navigator.clipboard.writeText(token);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('pocket_ai_token');
        router.replace('/login');
    };

    return (
        <div className="min-h-screen bg-gray-950 font-sans text-gray-100 p-6 md:p-12">
            <header className="max-w-4xl mx-auto flex items-center mb-8 gap-4">
                <button
                    onClick={() => router.back()}
                    className="p-2 -ml-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-800 transition-colors"
                    title={tc('back')}
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
            </header>

            <main className="max-w-4xl mx-auto space-y-8">
                <section className="p-6 border border-gray-800 rounded-2xl bg-gray-900 shadow-sm">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <User size={20} className="text-gray-400" />
                        {t('profile')}
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
                            <User size={32} className="text-gray-500" />
                        </div>
                        <div>
                            <p className="text-lg font-medium text-white">{t('defaultProfile')}</p>
                            <p className="text-sm text-gray-400">{t('authenticatedBrowser')}</p>
                        </div>
                    </div>
                </section>

                <section className="p-6 border border-yellow-500/20 rounded-2xl bg-gradient-to-br from-gray-900 to-yellow-500/5 shadow-sm">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <span className="text-yellow-400">⚠️</span>
                        {t('cliToken')}
                    </h2>
                    <p className="text-sm text-gray-400 mb-4">
                        {t('cliTokenWarning', { command: 'pocket-ai login' })}
                    </p>
                    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 font-mono text-xs md:text-sm break-all text-gray-300 relative group min-h-[80px] flex items-center justify-center">
                        {token ? token : <Loader2 className="w-5 h-5 animate-spin text-gray-500" />}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3">
                        <button
                            onClick={handleCopy}
                            disabled={!token}
                            className="px-5 py-2.5 bg-blue-600 rounded-xl hover:bg-blue-500 transition-colors font-medium flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed text-white"
                        >
                            {isCopied ? <Check size={16} /> : <Copy size={16} />}
                            {isCopied ? tc('copied') : t('copyToken')}
                        </button>
                        <button disabled className="px-5 py-2.5 border border-gray-700 rounded-xl hover:bg-gray-800 transition-colors font-medium text-sm text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed">
                            {t('newToken')}
                        </button>
                    </div>
                </section>

                {/* Language Switcher */}
                <section className="p-6 border border-gray-800 rounded-2xl bg-gray-900 shadow-sm">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Globe size={20} className="text-gray-400" />
                        {t('language')}
                    </h2>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setLocale('ko')}
                            className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-colors ${locale === 'ko'
                                ? 'bg-blue-600 text-white'
                                : 'border border-gray-700 text-gray-400 hover:bg-gray-800'
                                }`}
                        >
                            {t('korean')}
                        </button>
                        <button
                            onClick={() => setLocale('en')}
                            className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-colors ${locale === 'en'
                                ? 'bg-blue-600 text-white'
                                : 'border border-gray-700 text-gray-400 hover:bg-gray-800'
                                }`}
                        >
                            {t('english')}
                        </button>
                    </div>
                </section>

                <section className="p-6 border border-gray-800 rounded-2xl bg-gray-900 shadow-sm">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-400">
                        <LogOut size={20} />
                        {t('accountManagement')}
                    </h2>
                    <p className="text-sm text-gray-400 mb-5">
                        {t('logoutDescription')}
                    </p>
                    <button
                        onClick={handleLogout}
                        className="w-full sm:w-auto px-6 py-2.5 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10 transition-colors font-medium text-sm flex items-center justify-center gap-2"
                    >
                        <LogOut size={16} />
                        {t('logout')}
                    </button>
                </section>
            </main>
        </div>
    );
}

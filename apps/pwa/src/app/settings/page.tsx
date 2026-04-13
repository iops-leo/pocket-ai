'use client';

import { useState, useEffect, useMemo } from 'react';
import { Copy, LogOut, Loader2, Check, ArrowLeft, Globe, Github, Key, Eye, EyeOff, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useLocale } from '@/i18n/client';
import { clearTokens } from '@/lib/auth';

interface JwtPayload {
    sub: string;
    email: string;
    name?: string;
    login?: string;
    avatar_url?: string;
    exp?: number;
}

function decodeJwtPayload(token: string): JwtPayload | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload;
    } catch {
        return null;
    }
}

export default function SettingsPage() {
    const router = useRouter();
    const t = useTranslations('settings');
    const tc = useTranslations('common');
    const [locale, setLocale] = useLocale();
    const [token, setToken] = useState<string | null>(null);
    const [isCopied, setIsCopied] = useState(false);
    const [showToken, setShowToken] = useState(false);

    useEffect(() => {
        const storedToken = localStorage.getItem('pocket_ai_token');
        if (!storedToken) {
            clearTokens();
            router.replace('/login');
            return;
        }
        setToken(storedToken);
    }, [router]);

    const profile = useMemo(() => {
        if (!token) return null;
        return decodeJwtPayload(token);
    }, [token]);

    const handleCopy = async () => {
        if (token) {
            await navigator.clipboard.writeText(token);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

    const handleLogout = () => {
        clearTokens();
        router.replace('/');
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

            <main className="max-w-4xl mx-auto space-y-6">
                {/* GitHub 프로필 */}
                <section className="p-6 border border-gray-800 rounded-2xl bg-gray-900 shadow-sm">
                    <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
                        <Github size={20} className="text-gray-400" />
                        {t('profile')}
                    </h2>
                    <div className="flex items-center gap-4">
                        {profile?.avatar_url ? (
                            <Image
                                src={profile.avatar_url}
                                alt={profile.name || profile.login || ''}
                                width={56}
                                height={56}
                                className="rounded-full border-2 border-gray-700 shadow-lg"
                                unoptimized
                            />
                        ) : (
                            <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
                                <Github size={24} className="text-gray-500" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-lg font-medium text-white truncate">
                                {profile?.name || profile?.login || t('defaultProfile')}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                                {profile?.login && (
                                    <span className="text-sm text-gray-400 font-mono">@{profile.login}</span>
                                )}
                                {profile?.email && profile?.login && (
                                    <span className="text-gray-600">·</span>
                                )}
                                {profile?.email && (
                                    <span className="text-sm text-gray-500 truncate">{profile.email}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {/* CLI 토큰 */}
                <section className="p-6 border border-gray-800 rounded-2xl bg-gray-900 shadow-sm">
                    <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        <Key size={20} className="text-gray-400" />
                        {t('cliToken')}
                    </h2>
                    <p className="text-sm text-gray-500 mb-4">
                        {t('cliTokenDescription')}
                    </p>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 font-mono text-xs text-gray-400 truncate min-w-0">
                            {token
                                ? showToken
                                    ? token
                                    : '••••••••••••••••••••••••••••••••'
                                : <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                            }
                        </div>
                        <button
                            onClick={() => setShowToken(prev => !prev)}
                            className="p-2.5 border border-gray-700 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors flex-shrink-0"
                            title={showToken ? t('hideToken') : t('showToken')}
                        >
                            {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button
                            onClick={handleCopy}
                            disabled={!token}
                            className="p-2.5 border border-gray-700 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                            title={isCopied ? tc('copied') : t('copyToken')}
                        >
                            {isCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                        </button>
                    </div>
                </section>

                {/* 언어 설정 */}
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

                {/* 로그아웃 */}
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

                {/* 앱 정보 */}
                <section className="p-6 border border-gray-800 rounded-2xl bg-gray-900 shadow-sm">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Info size={20} className="text-gray-400" />
                        {t('about')}
                    </h2>
                    <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-gray-500">{t('version')}</span>
                            <span className="text-gray-300 font-mono">v0.1.0</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-500">{t('pwaUrl')}</span>
                            <span className="text-gray-300 font-mono text-xs">
                                {typeof window !== 'undefined' ? window.location.host : '-'}
                            </span>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

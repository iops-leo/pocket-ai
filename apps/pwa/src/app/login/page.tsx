'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Github, Loader2, Terminal, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const t = useTranslations('login');

    useEffect(() => {
        const errorParam = searchParams.get('error');
        if (errorParam) {
            setAuthError(errorParam === 'access_denied' ? t('accessDenied') : t('serverError'));
        }

        const token = searchParams.get('token');

        if (token) {
            // Coming from OAuth callback - store token and clean URL
            localStorage.setItem('pocket_ai_token', token);
            router.replace('/dashboard');
            return;
        }

        // Check if already logged in
        const existingToken = localStorage.getItem('pocket_ai_token');
        if (existingToken) {
            router.replace('/dashboard');
            return;
        }

        setIsLoading(false);
    }, [searchParams, router, t]);

    const handleLogin = () => {
        const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        window.location.href = `${serverUrl}/auth/github`;
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                <p className="text-gray-400">{t('checkingAccount')}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-gray-100 p-6">
            <div className="max-w-md w-full text-center flex flex-col gap-6">
                <div>
                    <h1 className="text-4xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                        {t('title')}
                    </h1>
                    <p className="text-gray-400">
                        {t('subtitle')}
                    </p>
                </div>

                {authError && (
                    <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm text-left">
                        <span className="font-semibold block mb-1">{t('authFailed')}</span>
                        {authError}
                    </div>
                )}

                <button
                    onClick={handleLogin}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white hover:bg-gray-100 rounded-xl text-gray-900 font-bold transition-all duration-200 shadow-lg shadow-white/5"
                >
                    <Github size={22} />
                    {t('loginWithGithub')}
                </button>

                <div className="mt-8 text-left bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold text-gray-200 mb-5 flex items-center gap-2">
                        <Terminal size={18} className="text-blue-400" />
                        {t('howToStart')}
                    </h2>
                    <ol className="text-sm text-gray-400 space-y-5">
                        <li className="flex gap-3 items-start">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-medium mt-0.5">1</span>
                            <span className="leading-relaxed">{t('step1')}</span>
                        </li>
                        <li className="flex gap-3 items-start">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-medium mt-0.5">2</span>
                            <span className="leading-relaxed">{t('step2_prefix')}<code className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded font-mono text-xs">{t('step2_code')}</code>{t('step2_suffix')}</span>
                        </li>
                        <li className="flex gap-3 items-start">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-medium mt-0.5">3</span>
                            <span className="leading-relaxed">{t('step3_prefix')}<code className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded font-mono text-xs">{t('step3_code')}</code>{t('step3_suffix')}</span>
                        </li>
                    </ol>
                </div>

                <div className="flex items-center justify-center gap-2 mt-4 text-xs text-gray-500">
                    <Shield size={14} className="text-emerald-500/70" />
                    <span>{t('e2eNotice')}</span>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}

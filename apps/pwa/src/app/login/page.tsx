'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Github, Key, Loader2, Terminal, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isProcessingToken, setIsProcessingToken] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const t = useTranslations('login');
    const [authMode, setAuthMode] = useState<'single' | 'github' | null>(null);
    const [setupToken, setSetupToken] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [tokenError, setTokenError] = useState<string | null>(null);

    useEffect(() => {
        const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9741';
        fetch(`${serverUrl}/auth/mode`)
            .then(res => res.json())
            .then(data => setAuthMode(data.mode))
            .catch(() => setAuthMode('single'));
    }, []);

    const handleTokenLogin = async () => {
        setIsLoggingIn(true);
        setTokenError(null);
        try {
            const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9741';
            const res = await fetch(`${serverUrl}/auth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: setupToken }),
            });
            if (!res.ok) {
                setTokenError(t('invalidToken'));
                return;
            }
            const data = await res.json();
            localStorage.setItem('pocket_ai_token', data.token);
            if (data.refreshToken) {
                localStorage.setItem('pocket_ai_refresh_token', data.refreshToken);
            }
            router.replace('/dashboard');
        } catch {
            setTokenError(t('serverError'));
        } finally {
            setIsLoggingIn(false);
        }
    };

    useEffect(() => {
        // OAuth callback - store token + refresh token
        const token = searchParams.get('token');
        const refreshToken = searchParams.get('refreshToken');
        if (token) {
            setIsProcessingToken(true);
            localStorage.setItem('pocket_ai_token', token);
            if (refreshToken) {
                localStorage.setItem('pocket_ai_refresh_token', refreshToken);
            }

            // 팝업/새탭에서 열린 경우: 원래 탭에 알리고 이 창 닫기
            try {
                const bc = new BroadcastChannel('pocket_ai_auth');
                bc.postMessage({ type: 'login_success', token, refreshToken });
                bc.close();
            } catch {
                // BroadcastChannel 미지원 브라우저 (fallback: 그냥 redirect)
            }

            // opener가 있으면 (window.open으로 열린 경우) 닫기 시도
            if (window.opener) {
                window.close();
                return;
            }

            // 그냥 같은 탭이면 대시보드로 이동
            router.replace('/dashboard');
            return;
        }

        // 원래 탭에서 BroadcastChannel로 로그인 성공 수신 대기
        let bc: BroadcastChannel | null = null;
        try {
            bc = new BroadcastChannel('pocket_ai_auth');
            bc.onmessage = (event) => {
                if (event.data?.type === 'login_success') {
                    // 팝업에서 전달된 토큰 저장 (이 탭에서도 사용 가능하도록)
                    if (event.data.token) {
                        localStorage.setItem('pocket_ai_token', event.data.token);
                    }
                    if (event.data.refreshToken) {
                        localStorage.setItem('pocket_ai_refresh_token', event.data.refreshToken);
                    }
                    bc?.close();
                    router.replace('/dashboard');
                }
            };
        } catch {
            // BroadcastChannel 미지원
        }

        const errorParam = searchParams.get('error');
        if (errorParam) {
            setAuthError(errorParam === 'access_denied' ? t('accessDenied') : t('serverError'));
        }

        return () => {
            try { bc?.close(); } catch { /* ignore */ }
        };
    }, [searchParams, router, t]);

    const handleLogin = () => {
        const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9741';
        const authUrl = `${serverUrl}/auth/github`;
        // 팝업으로 열기 (BroadcastChannel로 원래 창에서 dashboard 이동)
        const popup = window.open(authUrl, 'github_oauth', 'width=600,height=700,left=400,top=100');
        if (!popup) {
            // 팝업 차단된 경우 fallback: 같은 탭에서 이동
            window.location.href = authUrl;
        }
    };

    if (isProcessingToken) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <p className="text-gray-400 text-sm">{t('loggingIn')}</p>
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

                {authMode === 'github' ? (
                    <button
                        onClick={handleLogin}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white hover:bg-gray-100 rounded-xl text-gray-900 font-bold transition-all duration-200 shadow-lg shadow-white/5"
                    >
                        <Github size={22} />
                        {t('loginWithGithub')}
                    </button>
                ) : authMode === 'single' ? (
                    <div className="space-y-3">
                        <input
                            type="password"
                            value={setupToken}
                            onChange={(e) => setSetupToken(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleTokenLogin()}
                            placeholder={t('tokenPlaceholder')}
                            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
                            autoFocus
                        />
                        {tokenError && (
                            <p className="text-red-400 text-sm">{tokenError}</p>
                        )}
                        <button
                            onClick={handleTokenLogin}
                            disabled={!setupToken || isLoggingIn}
                            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-bold transition-all duration-200"
                        >
                            {isLoggingIn ? <Loader2 size={20} className="animate-spin" /> : <Key size={20} />}
                            {t('loginWithToken')}
                        </button>
                    </div>
                ) : (
                    <div className="flex justify-center py-4">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                    </div>
                )}

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

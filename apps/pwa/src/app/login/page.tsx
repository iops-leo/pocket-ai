'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Github, Loader2, Terminal, Shield } from 'lucide-react';

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    useEffect(() => {
        const errorParam = searchParams.get('error');
        if (errorParam) {
            setAuthError(errorParam === 'access_denied' ? '로그인이 취소되었거나 거부되었습니다.' : '로그인 처리 중 서버 오류가 발생했습니다.');
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
    }, [searchParams, router]);

    const handleLogin = () => {
        const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        window.location.href = `${serverUrl}/auth/github`;
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                <p className="text-gray-400">계정 상태를 확인하고 있습니다...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-gray-100 p-6">
            <div className="max-w-md w-full text-center flex flex-col gap-6">
                <div>
                    <h1 className="text-4xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                        Pocket AI
                    </h1>
                    <p className="text-gray-400">
                        어디서든 내 PC의 AI 에이전트를 원격 제어하세요
                    </p>
                </div>

                {authError && (
                    <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm text-left">
                        <span className="font-semibold block mb-1">인증 실패</span>
                        {authError}
                    </div>
                )}

                <button
                    onClick={handleLogin}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white hover:bg-gray-100 rounded-xl text-gray-900 font-bold transition-all duration-200 shadow-lg shadow-white/5"
                >
                    <Github size={22} />
                    GitHub로 시작하기
                </button>

                <div className="mt-8 text-left bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold text-gray-200 mb-5 flex items-center gap-2">
                        <Terminal size={18} className="text-blue-400" />
                        시작하는 방법
                    </h2>
                    <ol className="text-sm text-gray-400 space-y-5">
                        <li className="flex gap-3 items-start">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-medium mt-0.5">1</span>
                            <span className="leading-relaxed">먼저 데스크톱 터미널에서 구동하려는 프로젝트 폴더로 이동합니다.</span>
                        </li>
                        <li className="flex gap-3 items-start">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-medium mt-0.5">2</span>
                            <span className="leading-relaxed"><code className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded font-mono text-xs">pocket-ai login</code> 명령어를 실행해 PC를 인증합니다.</span>
                        </li>
                        <li className="flex gap-3 items-start">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-medium mt-0.5">3</span>
                            <span className="leading-relaxed"><code className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded font-mono text-xs">pocket-ai</code> 로 데몬을 켜면 즉시 이곳에 내 PC가 나타납니다.</span>
                        </li>
                    </ol>
                </div>

                <div className="flex items-center justify-center gap-2 mt-4 text-xs text-gray-500">
                    <Shield size={14} className="text-emerald-500/70" />
                    <span>모든 통신은 <strong>AES-256-GCM</strong>으로 종단간 암호화(E2E)됩니다</span>
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

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Github, Loader2 } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
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
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-gray-100 p-6">
            <div className="max-w-sm w-full text-center">
                <h1 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                    Pocket AI
                </h1>
                <p className="text-gray-400 mb-8">
                    어디서든 PC의 AI CLI 세션을 이어서 사용하세요
                </p>

                <button
                    onClick={handleLogin}
                    className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 rounded-xl text-white font-medium transition-all duration-200"
                >
                    <Github size={20} />
                    GitHub로 로그인
                </button>

                <p className="text-xs text-gray-500 mt-6">
                    E2E 암호화로 안전하게 보호됩니다
                </p>
            </div>
        </div>
    );
}

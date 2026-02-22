'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Terminal as TerminalIcon, Cpu, LogOut, RefreshCw, Loader2 } from 'lucide-react';
import { TerminalChat } from '@/components/TerminalChat';

interface Session {
    sessionId: string;
    publicKey: string;
    metadata: {
        hostname?: string;
        engine?: string;
    };
    status: string;
}

export default function DashboardPage() {
    const router = useRouter();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeSession, setActiveSession] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSessions = async () => {
        const token = localStorage.getItem('pocket_ai_token');
        if (!token) {
            router.replace('/login');
            return;
        }

        try {
            setError(null);
            const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const res = await fetch(`${serverUrl}/api/sessions`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.status === 401) {
                // Token expired or invalid
                localStorage.removeItem('pocket_ai_token');
                router.replace('/login');
                return;
            }

            const data = await res.json();
            if (data.success) {
                setSessions(data.data || []);
            } else {
                setError(data.error || 'Failed to fetch sessions');
            }
        } catch {
            setError('서버에 연결할 수 없습니다');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
        // Poll every 10 seconds for session updates
        const interval = setInterval(fetchSessions, 10000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('pocket_ai_token');
        router.replace('/login');
    };

    if (activeSession) {
        return <TerminalChat sessionId={activeSession} onBack={() => setActiveSession(null)} />;
    }

    return (
        <div className="min-h-screen bg-gray-950 font-sans text-gray-100 p-6 md:p-12">
            <header className="flex justify-between items-center mb-12">
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                    Pocket AI
                </h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchSessions}
                        className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-800 transition-colors"
                        title="새로고침"
                    >
                        <RefreshCw size={18} />
                    </button>
                    <button
                        onClick={handleLogout}
                        className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-800 transition-colors"
                        title="로그아웃"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <TerminalIcon className="text-blue-400" /> 활성 세션
                </h2>

                {isLoading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                ) : error ? (
                    <div className="text-center p-12 border border-dashed border-red-800/50 rounded-2xl bg-red-900/10">
                        <p className="text-red-400">{error}</p>
                        <button
                            onClick={fetchSessions}
                            className="mt-4 text-sm text-gray-400 hover:text-white underline"
                        >
                            다시 시도
                        </button>
                    </div>
                ) : sessions.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                        {sessions.map((session) => (
                            <div
                                key={session.sessionId}
                                onClick={() => setActiveSession(session.sessionId)}
                                className="p-6 rounded-2xl border bg-gray-900 border-gray-700 hover:border-blue-500 cursor-pointer shadow-lg hover:shadow-blue-900/20 transition-all duration-200 group relative overflow-hidden"
                            >
                                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 group-hover:bg-emerald-400 transition-colors" />

                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="font-medium text-lg text-white font-mono flex items-center gap-2">
                                        {session.metadata?.hostname || 'Unknown'}
                                    </h3>
                                    <span className="px-2 py-1 text-xs rounded-full font-medium bg-emerald-500/10 text-emerald-400">
                                        online
                                    </span>
                                </div>

                                <div className="text-sm text-gray-400 flex items-center gap-4">
                                    <span className="flex items-center gap-1">
                                        <Cpu size={14} /> {session.metadata?.engine || 'claude'}
                                    </span>
                                    <span className="flex items-center gap-1 text-xs text-gray-500 font-mono">
                                        {session.sessionId.slice(0, 8)}...
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center p-12 border border-dashed border-gray-800 rounded-2xl bg-gray-900/30">
                        <p className="text-gray-400">활성화된 PC 세션이 없습니다.</p>
                        <p className="text-sm text-gray-500 mt-2">
                            PC에서 <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">pocket-ai start</code>를 실행하세요.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}

'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Terminal as TerminalIcon, Cpu, RefreshCw, Loader2, Settings, Search, Wifi, WifiOff, MoreVertical } from 'lucide-react';
import { TerminalChat } from '@/components/TerminalChat';
import { SessionDetailsModal } from '@/components/SessionDetailsModal';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';

interface Session {
    sessionId: string;
    publicKey: string;
    metadata: {
        hostname?: string;
        engine?: string;
    };
    status: string;
    lastPing?: number;
}

export default function DashboardPage() {
    const router = useRouter();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeSession, setActiveSession] = useState<string | null>(null);
    const [selectedSessionForDetails, setSelectedSessionForDetails] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Search & Filter
    const [searchQuery, setSearchQuery] = useState('');
    const [engineFilter, setEngineFilter] = useState<string>('all');

    const socketRef = useRef<Socket | null>(null);

    const fetchSessions = async (showLoader = true) => {
        const token = localStorage.getItem('pocket_ai_token');
        if (!token) {
            router.replace('/login');
            return;
        }

        try {
            setError(null);
            if (showLoader) setIsLoading(true);

            const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const res = await fetch(`${serverUrl}/api/sessions`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.status === 401) {
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
            if (showLoader) setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions(true);

        const token = localStorage.getItem('pocket_ai_token');
        if (!token) return;

        const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

        const socket = io(serverUrl, {
            auth: { token, role: 'pwa' },
            transports: ['websocket']
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Real-time updates connected');
        });

        socket.on('session-offline', ({ sessionId }: { sessionId: string }) => {
            setSessions(prev => prev.map(s =>
                s.sessionId === sessionId ? { ...s, status: 'offline' } : s
            ));
        });

        return () => {
            socket.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredSessions = sessions.filter(session => {
        const matchesSearch = session.metadata?.hostname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            session.sessionId.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesEngine = engineFilter === 'all' || session.metadata?.engine?.toLowerCase() === engineFilter.toLowerCase();
        return matchesSearch && matchesEngine;
    });

    if (activeSession) {
        return <TerminalChat sessionId={activeSession} onBack={() => setActiveSession(null)} />;
    }

    return (
        <div className="min-h-screen bg-gray-950 font-sans text-gray-100 p-6 md:p-12">
            <header className="max-w-4xl mx-auto flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                    Pocket AI
                </h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => fetchSessions(true)}
                        className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-800 transition-colors"
                        title="새로고침"
                    >
                        <RefreshCw size={18} />
                    </button>
                    <Link
                        href="/settings"
                        className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-800 transition-colors"
                        title="설정"
                    >
                        <Settings size={20} />
                    </Link>
                </div>
            </header>

            <main className="max-w-4xl mx-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <TerminalIcon className="text-blue-400" /> 세션 목록
                    </h2>

                    {/* Filter & Search */}
                    <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                            <input
                                type="text"
                                placeholder="호스트명 검색..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full sm:w-64 pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                            />
                        </div>
                        <select
                            value={engineFilter}
                            onChange={(e) => setEngineFilter(e.target.value)}
                            className="w-full sm:w-auto px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-sm text-gray-300 focus:outline-none focus:border-blue-500 transition-all"
                        >
                            <option value="all">모든 엔진</option>
                            <option value="claude">Claude</option>
                            <option value="gemini">Gemini</option>
                        </select>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                ) : error ? (
                    <div className="text-center p-12 border border-dashed border-red-800/50 rounded-2xl bg-red-900/10">
                        <p className="text-red-400">{error}</p>
                        <button
                            onClick={() => fetchSessions(true)}
                            className="mt-4 text-sm text-gray-400 hover:text-white underline"
                        >
                            다시 시도
                        </button>
                    </div>
                ) : filteredSessions.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                        {filteredSessions.map((session) => {
                            const isOnline = session.status === 'online';
                            return (
                                <div
                                    key={session.sessionId}
                                    className="p-5 rounded-2xl border bg-gray-900 border-gray-800 hover:border-blue-600/50 cursor-pointer shadow-lg hover:shadow-blue-900/10 transition-all duration-200 group relative overflow-hidden flex flex-col justify-between"
                                >
                                    <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${isOnline ? 'bg-emerald-500' : 'bg-gray-600'}`} />

                                    <div className="flex justify-between items-start mb-4 relative z-10" onClick={() => isOnline && setActiveSession(session.sessionId)}>
                                        <div>
                                            <h3 className="font-medium text-lg text-white font-mono flex items-center gap-2">
                                                {session.metadata?.hostname || 'Unknown Host'}
                                            </h3>
                                            <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
                                                <Cpu size={14} /> {session.metadata?.engine || 'claude'}
                                                <span className="mx-1">•</span>
                                                <span className="font-mono text-xs">{session.sessionId.slice(0, 8)}</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-2">
                                            <span className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full font-medium border ${isOnline
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                : 'bg-gray-800 text-gray-400 border-gray-700'
                                                }`}>
                                                {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
                                                {isOnline ? 'Online' : 'Offline'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="pt-4 mt-auto border-t border-gray-800/50 flex justify-between items-center text-xs text-gray-500">
                                        <span>마지막 활동: {isOnline ? '방금 전' : '알 수 없음'}</span>
                                        <button
                                            className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedSessionForDetails(session);
                                            }}
                                        >
                                            <MoreVertical size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center p-16 border border-dashed border-gray-800 rounded-2xl bg-gray-900/30 flex flex-col items-center">
                        <TerminalIcon size={40} className="text-gray-700 mb-4" />
                        <p className="text-gray-400 text-lg mb-2">활성화된 PC 세션이 없습니다</p>
                        <p className="text-sm text-gray-500">
                            PC 터미널에서 <code className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded font-mono text-xs">pocket-ai start</code>를 실행하여 연결하세요.
                        </p>
                    </div>
                )}
            </main>

            {selectedSessionForDetails && (
                <SessionDetailsModal
                    session={selectedSessionForDetails}
                    onClose={() => setSelectedSessionForDetails(null)}
                    onConnect={() => {
                        setActiveSession(selectedSessionForDetails.sessionId);
                        setSelectedSessionForDetails(null);
                    }}
                />
            )}
        </div>
    );
}

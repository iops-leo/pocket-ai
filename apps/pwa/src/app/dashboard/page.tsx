'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Terminal, Loader2, Menu } from 'lucide-react';
import { TerminalChat } from '@/components/TerminalChat';
import { SessionSidebar } from '@/components/SessionSidebar';
import { NewSessionModal } from '@/components/NewSessionModal';
import { io, Socket } from 'socket.io-client';
import { useTranslations } from 'next-intl';
import { generateECDHKeyPair, exportPublicKey } from '@pocket-ai/wire';

interface Session {
    sessionId: string;
    publicKey: string;
    metadata: {
        sessionName?: string;
        hostname?: string;
        engine?: string;
        cwd?: string;
    };
    status: string;
    lastPing?: number;
}

interface RecentPathItem {
    path: string;
    engine?: string;
    lastUsedAt?: string;
    useCount?: number;
}

export default function DashboardPage() {
    const router = useRouter();
    const t = useTranslations('dashboard');
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeSession, setActiveSession] = useState<string | null>(null);
    const [recentPaths, setRecentPaths] = useState<RecentPathItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Sidebar state
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    // New session modal
    const [showNewSessionModal, setShowNewSessionModal] = useState(false);

    const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const hasAutoOpenedMobileSidebar = useRef(false);

    const showToast = useCallback((message: string, type: 'error' | 'success' = 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchSessions = useCallback(async (showLoader = true) => {
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
            setError(t('cannotConnect'));
        } finally {
            if (showLoader) setIsLoading(false);
        }
    }, [router, t]);

    const fetchRecentPaths = useCallback(async () => {
        const token = localStorage.getItem('pocket_ai_token');
        if (!token) return;

        try {
            const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const res = await fetch(`${serverUrl}/api/sessions/recent-paths?limit=8`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!res.ok) return;

            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                const normalized = data.data
                    .map((item: unknown): RecentPathItem | null => {
                        if (typeof item === 'string') {
                            return { path: item };
                        }
                        if (typeof item === 'object' && item !== null) {
                            const parsed = item as Record<string, unknown>;
                            if (typeof parsed.path !== 'string') {
                                return null;
                            }
                            return {
                                path: parsed.path,
                                engine: typeof parsed.engine === 'string' ? parsed.engine : undefined,
                                lastUsedAt: typeof parsed.lastUsedAt === 'string' ? parsed.lastUsedAt : undefined,
                                useCount: typeof parsed.useCount === 'number' ? parsed.useCount : undefined,
                            };
                        }
                        return null;
                    })
                    .filter((item: RecentPathItem | null): item is RecentPathItem => item !== null);
                setRecentPaths(normalized);
            }
        } catch {
            // 최근 경로 로드는 UX 보조 기능이므로 실패 무시
        }
    }, []);

    useEffect(() => {
        fetchSessions(true);
        fetchRecentPaths();

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
            // 사용자 룸 가입 → session-online/offline 실시간 수신
            socket.emit('pwa-dashboard-auth', { token });
        });

        socket.on('session-offline', ({ sessionId }: { sessionId: string }) => {
            setSessions(prev => prev.map(s =>
                s.sessionId === sessionId ? { ...s, status: 'offline' } : s
            ));
        });

        socket.on('session-online', ({ sessionId }: { sessionId: string }) => {
            setSessions(prev => prev.map(s =>
                s.sessionId === sessionId ? { ...s, status: 'online' } : s
            ));
            // Also refresh to get updated metadata
            fetchSessions(false);
        });

        return () => {
            socket.disconnect();
        };
    }, [fetchSessions, fetchRecentPaths]);

    useEffect(() => {
        if (hasAutoOpenedMobileSidebar.current) return;
        if (typeof window === 'undefined') return;
        if (window.innerWidth >= 1024) return;
        if (activeSession) return;

        setIsMobileSidebarOpen(true);
        hasAutoOpenedMobileSidebar.current = true;
    }, [activeSession]);

    const handleSelectSession = (sessionId: string) => {
        setActiveSession(sessionId);
        setIsMobileSidebarOpen(false); // Close mobile sidebar when selecting
    };

    const handleNewSession = async (data: { cwd: string; engine: string; sessionName?: string }) => {
        const token = localStorage.getItem('pocket_ai_token');
        if (!token) {
            router.replace('/login');
            throw new Error(t('createFailed'));
        }

        const launcherSession = (activeSession
            ? sessions.find(session => session.sessionId === activeSession && session.status === 'online')
            : null) ?? sessions.find(session => session.status === 'online');

        if (!launcherSession) {
            throw new Error(t('noOnlineLauncher'));
        }

        const keyPair = await generateECDHKeyPair();
        const publicKey = await exportPublicKey(keyPair.publicKey);
        const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

        const res = await fetch(`${serverUrl}/api/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                publicKey,
                metadata: {
                    cwd: data.cwd,
                    engine: data.engine,
                    hostname: 'pending-from-pwa',
                    sessionName: data.sessionName,
                },
                autoStart: true,
                launcherSessionId: launcherSession.sessionId,
            }),
        });

        if (res.status === 401) {
            localStorage.removeItem('pocket_ai_token');
            router.replace('/login');
            throw new Error(t('createFailed'));
        }

        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload.success) {
            throw new Error(payload.error || t('createFailed'));
        }
        if (!payload?.data?.launchRequested) {
            throw new Error(t('createLaunchPending'));
        }

        setRecentPaths(prev => {
            const next = [
                {
                    path: data.cwd,
                    engine: data.engine,
                    lastUsedAt: new Date().toISOString(),
                    useCount: (prev.find(item => item.path === data.cwd)?.useCount ?? 0) + 1,
                },
                ...prev.filter(item => item.path !== data.cwd),
            ];
            return next.slice(0, 8);
        });
        await fetchSessions(false);
    };

    const handleRenameSession = async (sessionId: string, sessionName: string) => {
        const token = localStorage.getItem('pocket_ai_token');
        if (!token) {
            router.replace('/login');
            return;
        }

        const trimmedName = sessionName.trim();
        if (!trimmedName) return;

        try {
            const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const res = await fetch(`${serverUrl}/api/sessions/${sessionId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    metadata: {
                        sessionName: trimmedName,
                    },
                }),
            });

            if (res.status === 401) {
                localStorage.removeItem('pocket_ai_token');
                router.replace('/login');
                return;
            }

            const payload = await res.json().catch(() => ({}));
            if (!res.ok || !payload.success) return;

            setSessions(prev => prev.map(session => (
                session.sessionId === sessionId
                    ? {
                        ...session,
                        metadata: {
                            ...(session.metadata ?? {}),
                            sessionName: trimmedName,
                        },
                    }
                    : session
            )));
        } catch {
            showToast(t('renameSessionFailed'));
        }
    };

    const handleDeleteSession = async (sessionId: string) => {
        const token = localStorage.getItem('pocket_ai_token');
        if (!token) {
            router.replace('/login');
            return;
        }

        try {
            const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const res = await fetch(`${serverUrl}/api/sessions/${sessionId}`, {
                method: 'DELETE',
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
                // 로컬 상태에서 즉시 제거
                setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
                if (activeSession === sessionId) {
                    setActiveSession(null);
                }
            }
        } catch {
            showToast(t('deleteSessionFailed'));
        }
    };

    // Loading state
    if (isLoading) {
        return (
            <div className="h-screen bg-gray-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    // Error state
    if (error && sessions.length === 0) {
        return (
            <div className="h-screen bg-gray-950 flex items-center justify-center p-6">
                <div className="text-center">
                    <p className="text-red-400 mb-4">{error}</p>
                    <button
                        onClick={() => fetchSessions(true)}
                        className="text-sm text-blue-400 hover:text-blue-300 underline"
                    >
                        {t('refresh')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-gray-950 flex overflow-hidden">
            {/* Mobile sidebar overlay */}
            {isMobileSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setIsMobileSidebarOpen(false)}
                />
            )}

            {/* Sidebar - desktop always visible, mobile slide-in */}
            <div className={`
                fixed lg:static inset-y-0 left-0 z-50
                transform transition-transform duration-300 ease-in-out
                lg:transform-none lg:flex-shrink-0
                ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                <SessionSidebar
                    sessions={sessions}
                    activeSessionId={activeSession}
                    onSelectSession={handleSelectSession}
                    onDeleteSession={handleDeleteSession}
                    onRenameSession={handleRenameSession}
                    onNewSession={() => setShowNewSessionModal(true)}
                    onRefresh={() => fetchSessions(false)}
                    isCollapsed={isSidebarCollapsed}
                    onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                />
            </div>

            {/* Main content area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile header - only visible on mobile */}
                <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900">
                    <button
                        onClick={() => setIsMobileSidebarOpen(true)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <Menu size={24} />
                    </button>
                    <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                        Pocket AI
                    </h1>
                    <div className="w-10" /> {/* Spacer for centering */}
                </div>

                {/* Chat area or empty state */}
                {activeSession ? (
                    <TerminalChat
                        sessionId={activeSession}
                        onBack={() => {
                            setActiveSession(null);
                            // 모바일에서 뒤로가기 시 사이드바 재오픈
                            if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                setIsMobileSidebarOpen(true);
                            }
                        }}
                        embedded={true}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8">
                        <div className="w-16 h-16 rounded-2xl bg-gray-800/50 flex items-center justify-center border border-gray-700/40 mb-6">
                            <Terminal size={28} className="text-gray-500" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-300 mb-2">{t('selectSession')}</h2>
                        <p className="text-sm text-gray-500 text-center max-w-sm">
                            {t('selectSessionHint')}
                        </p>

                        {sessions.length === 0 && (
                            <div className="mt-8 p-6 bg-gray-900/50 border border-gray-800 rounded-xl max-w-md text-center">
                                <p className="text-gray-400 text-sm mb-2">{t('noSessions')}</p>
                                <p className="text-gray-500 text-xs font-mono">
                                    {t('noSessionsHint', { command: 'pocket-ai' })}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Toast 알림 */}
            {toast && (
                <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl transition-all ${
                    toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                }`}>
                    {toast.message}
                </div>
            )}

            {/* New Session Modal */}
            {showNewSessionModal && (
                <NewSessionModal
                    onClose={() => setShowNewSessionModal(false)}
                    onSubmit={handleNewSession}
                    recentPaths={recentPaths}
                    enabledEngines={Array.from(
                        new Set(
                            sessions
                                .filter(session => session.status === 'online')
                                .map(session => session.metadata?.engine?.toLowerCase())
                                .filter((engine): engine is string => Boolean(engine))
                        )
                    )}
                />
            )}
        </div>
    );
}

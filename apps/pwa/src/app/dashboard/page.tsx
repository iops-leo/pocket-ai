'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Terminal, Loader2, Menu } from 'lucide-react';
import { TerminalChat } from '@/components/TerminalChat';
import { SessionSidebar } from '@/components/SessionSidebar';
import { NewSessionModal } from '@/components/NewSessionModal';
import { io, Socket } from 'socket.io-client';
import { useTranslations } from 'next-intl';

interface Session {
    sessionId: string;
    publicKey: string;
    metadata: {
        hostname?: string;
        engine?: string;
        cwd?: string;
    };
    status: string;
    lastPing?: number;
}

export default function DashboardPage() {
    const router = useRouter();
    const t = useTranslations('dashboard');
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeSession, setActiveSession] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Sidebar state
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    // New session modal
    const [showNewSessionModal, setShowNewSessionModal] = useState(false);

    const socketRef = useRef<Socket | null>(null);

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
    }, [fetchSessions]);

    const handleSelectSession = (sessionId: string) => {
        setActiveSession(sessionId);
        setIsMobileSidebarOpen(false); // Close mobile sidebar when selecting
    };

    const handleNewSession = async (data: { cwd: string; engine: string }) => {
        // Note: This creates a placeholder - actual session creation happens on the PC
        // For now, show a hint to the user
        console.log('New session request:', data);
        // In a real implementation, this would send a notification to the PC daemon
        // For now, just close the modal
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
                    onNewSession={() => setShowNewSessionModal(true)}
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
                        onBack={() => setActiveSession(null)}
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

            {/* New Session Modal */}
            {showNewSessionModal && (
                <NewSessionModal
                    onClose={() => setShowNewSessionModal(false)}
                    onSubmit={handleNewSession}
                />
            )}
        </div>
    );
}

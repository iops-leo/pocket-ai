'use client';

import { X, Copy, Check, Terminal, Cpu, Clock, Wifi, Key } from 'lucide-react';
import { useState } from 'react';

interface Session {
    sessionId: string;
    publicKey: string;
    metadata: {
        hostname?: string;
        engine?: string;
    };
    status: string;
}

interface SessionDetailsModalProps {
    session: Session;
    onClose: () => void;
    onConnect: () => void;
}

export function SessionDetailsModal({ session, onClose, onConnect }: SessionDetailsModalProps) {
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const handleCopy = async (text: string, field: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const InfoRow = ({ label, value, copyable = false, icon: Icon }: any) => (
        <div className="flex justify-between items-center py-3 border-b border-gray-800/50 last:border-0">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
                {Icon && <Icon size={16} className="text-gray-500" />}
                {label}
            </div>
            <div className="flex items-center gap-3">
                <span className="text-gray-200 font-mono text-xs max-w-[200px] truncate" title={value}>
                    {value}
                </span>
                {copyable && (
                    <button
                        onClick={() => handleCopy(value, label)}
                        className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
                        title="복사"
                    >
                        {copiedField === label ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-gray-700/60 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-gray-950/50">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Terminal size={18} className="text-blue-400" />
                        세션 상세 정보
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    <div className="mb-6 p-4 rounded-xl border border-gray-800 bg-gray-950 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${session.status === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-gray-600'}`} />
                            <span className="font-semibold text-white">
                                {session.metadata?.hostname || 'Unknown Host'}
                            </span>
                        </div>
                        <span className={`px-2.5 py-1 text-xs rounded-full border ${session.status === 'online'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-gray-800 text-gray-400 border-gray-700'
                            }`}>
                            {session.status === 'online' ? '온라인 연결됨' : '오프라인'}
                        </span>
                    </div>

                    <div className="space-y-1">
                        <InfoRow label="세션 ID" value={session.sessionId} copyable icon={Key} />
                        <InfoRow label="AI 엔진" value={session.metadata?.engine || 'claude'} icon={Cpu} />
                        <InfoRow label="공개 키" value={session.publicKey ? session.publicKey.substring(0, 32) + '...' : 'N/A'} copyable icon={Key} />
                        <InfoRow label="상태" value={session.status} icon={Wifi} />
                        <InfoRow label="마지막 활성화" value="방금 전" icon={Clock} />
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-800 bg-gray-950/50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 px-4 rounded-xl border border-gray-700 hover:bg-gray-800 text-gray-300 font-medium transition-colors"
                    >
                        닫기
                    </button>
                    {session.status === 'online' && (
                        <button
                            onClick={onConnect}
                            className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors shadow-lg shadow-blue-900/20 flex justify-center items-center gap-2"
                        >
                            <Terminal size={18} />
                            터미널 연결
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

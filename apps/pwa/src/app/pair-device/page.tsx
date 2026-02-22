'use client';

import { useState } from 'react';
import { ArrowLeft, QrCode, Smartphone, Loader2, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

export default function PairDevicePage() {
    const router = useRouter();
    const [pairingState, setPairingState] = useState<'idle' | 'scanning' | 'success'>('idle');

    // MOCK Function for UI demonstration
    const simulatePairing = () => {
        setPairingState('scanning');
        setTimeout(() => {
            setPairingState('success');
            setTimeout(() => {
                router.replace('/dashboard');
            }, 1500);
        }, 2500);
    };

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-12">
            <header className="max-w-3xl mx-auto flex items-center gap-4 mb-10">
                <button
                    onClick={() => router.back()}
                    className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white"
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-bold text-white">새 디바이스 수동 연결</h1>
            </header>

            <main className="max-w-3xl mx-auto grid md:grid-cols-2 gap-8">
                {/* QR Generation */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden">
                    <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <QrCode className="text-blue-400" /> 1. QR 코드 생성
                    </h2>

                    <div className="bg-white p-4 rounded-xl shadow-inner mb-6">
                        <QRCodeSVG
                            value={JSON.stringify({ type: 'pocket-ai-pairing', tempKey: 'mock-key-123' })}
                            size={180}
                            level="H"
                            includeMargin={false}
                        />
                    </div>

                    <p className="text-gray-400 text-sm leading-relaxed mb-6">
                        PC 터미널에서 <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300 mx-1">pocket-ai pair</code> 명령어를 실행하고 위 QR 코드를 웹캠으로 인식시켜주세요. (대체 접속 방법)
                    </p>

                    <button
                        onClick={simulatePairing}
                        className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl font-medium transition-colors text-sm w-full"
                    >
                        스캔 여부 확인(시뮬레이션)
                    </button>
                </div>

                {/* Status or Manual Pairing */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg">
                    {pairingState === 'idle' && (
                        <div className="animate-in fade-in duration-500">
                            <div className="w-16 h-16 bg-blue-500/10 rounded-full flex flex-col items-center justify-center mx-auto mb-6">
                                <Smartphone className="w-8 h-8 text-blue-400" />
                            </div>
                            <h3 className="text-lg font-medium text-white mb-2">계정 기반 자동 연결 (권장)</h3>
                            <p className="text-gray-400 text-sm leading-relaxed mb-8">
                                복잡한 QR 페어링 대신, PC 터미널에서 <code>pocket-ai login</code> 명령어로 GitHub 계정을 인증하면 E2E 암호화 과정이 백그라운드에서 자동 체결됩니다.
                            </p>
                            <button
                                onClick={() => router.push('/settings')}
                                className="px-6 py-2.5 text-blue-400 border border-blue-500/30 rounded-xl hover:bg-blue-500/10 font-medium transition-colors text-sm w-full"
                            >
                                내 로그인 토큰 확인하러 가기
                            </button>
                        </div>
                    )}

                    {pairingState === 'scanning' && (
                        <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
                            <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
                            <p className="text-lg font-medium text-white mt-2">안전한 채널 협상 중...</p>
                            <p className="text-gray-400 text-sm">PC의 데몬 핑을 기다리고 있습니다</p>
                        </div>
                    )}

                    {pairingState === 'success' && (
                        <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
                            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30 p-1">
                                <div className="w-full h-full bg-emerald-500 rounded-full flex items-center justify-center">
                                    <CheckCircle2 className="w-8 h-8 text-white" />
                                </div>
                            </div>
                            <p className="text-xl font-medium text-emerald-400 mt-2">연결 성공!</p>
                            <p className="text-gray-400 text-sm">대시보드로 이동합니다...</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

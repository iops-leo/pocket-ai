'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Terminal, Shield, Globe, Cpu, ArrowRight, Github } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function LandingPage() {
  const router = useRouter();
  const t = useTranslations('landing');
  const [isChecking, setIsChecking] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('pocket_ai_token');
    if (token) {
      setIsLoggedIn(true);
    }
    setIsChecking(false);
  }, []);

  const handleCtaClick = () => {
    if (isLoggedIn) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 selection:bg-blue-500/30 font-sans overflow-hidden">
      {/* Ambient Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-[-20%] w-[800px] h-[600px] bg-emerald-600/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Navigation */}
      <nav className="relative z-10 max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Terminal size={18} className="text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-400">
            Pocket AI
          </span>
        </div>
        <div>
          <button
            onClick={handleCtaClick}
            className="px-5 py-2.5 rounded-full text-sm font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 transition-all backdrop-blur-md"
          >
            {isLoggedIn ? t('ctaDashboard') : t('ctaStart')}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-widest mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          {t('heroBadge')}
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 max-w-4xl leading-[1.1]">
          {t('heroTitle').split(' ').map((word, i) => (
            <span key={i} className={i % 2 === 1 ? 'bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400' : 'text-gray-100'}>
              {word}{' '}
            </span>
          ))}
        </h1>

        <p className="text-lg md:text-xl text-gray-400 max-w-2xl mb-12 leading-relaxed">
          {t('heroSubtitle')}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <button
            onClick={handleCtaClick}
            className="group flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white text-gray-900 font-bold text-lg hover:bg-gray-100 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.02]"
          >
            {!isLoggedIn && <Github size={20} />}
            {isLoggedIn ? t('ctaDashboard') : t('ctaStart')}
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Hero Terminal Mockup */}
        <div className="mt-24 w-full max-w-4xl relative group perspective-[2000px]">
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent z-10 pointer-events-none h-full translate-y-12" />
          <div className="rounded-2xl border border-gray-800 bg-gray-900/80 backdrop-blur-xl shadow-2xl overflow-hidden transition-transform duration-700 ease-out hover:rotate-x-2">
            {/* Terminal Header */}
            <div className="flex items-center px-4 py-3 bg-gray-950/50 border-b border-gray-800">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              </div>
              <div className="text-xs font-mono text-gray-500 ml-4 flex-1 text-center pr-12">
                {t('mockupHeader')}
              </div>
            </div>
            {/* Terminal Content */}
            <div className="p-6 text-left font-mono text-sm space-y-3">
              <div className="text-gray-300">
                <span className="text-emerald-400">➜</span> <span className="text-blue-400">~</span> {t('mockupLine1')}
              </div>
              <div className="text-gray-400">{t('mockupLine2')}</div>
              <div className="text-gray-400">{t('mockupLine3')}</div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 text-xs flex items-center justify-center rounded-sm bg-blue-500 text-white animate-pulse">█</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-24 border-t border-gray-800/50 bg-gray-950/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="p-8 rounded-3xl bg-gray-900/40 border border-gray-800/80 backdrop-blur-sm hover:bg-gray-800/50 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mb-6">
              <Globe size={24} className="text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-200 mb-3">{t('featureAnywhere')}</h3>
            <p className="text-gray-400 leading-relaxed text-sm">
              {t('featureAnywhereDesc')}
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-8 rounded-3xl bg-gray-900/40 border border-gray-800/80 backdrop-blur-sm hover:bg-gray-800/50 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 mb-6">
              <Cpu size={24} className="text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-200 mb-3">{t('featureRealtime')}</h3>
            <p className="text-gray-400 leading-relaxed text-sm">
              {t('featureRealtimeDesc')}
            </p>
          </div>

          {/* Feature 3 */}
          <div className="p-8 rounded-3xl bg-gray-900/40 border border-gray-800/80 backdrop-blur-sm hover:bg-gray-800/50 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 mb-6">
              <Shield size={24} className="text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-200 mb-3">{t('featureE2E')}</h3>
            <p className="text-gray-400 leading-relaxed text-sm">
              {t('featureE2EDesc')}
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-900 bg-gray-950 px-6 py-8 text-center text-sm text-gray-600">
        <p>&copy; {new Date().getFullYear()} {t('footer')}</p>
      </footer>
    </div>
  );
}

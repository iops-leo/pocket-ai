'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Terminal, Shield, Wifi, Cpu, ArrowRight, Github, Lock, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function LandingPage() {
  const router = useRouter();
  const t = useTranslations('landing');
  const [isChecking, setIsChecking] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [typingStep, setTypingStep] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('pocket_ai_token');
    if (token) setIsLoggedIn(true);
    setIsChecking(false);
  }, []);

  useEffect(() => {
    const text = '$ pocket-ai';
    let i = 0;
    const delay = setTimeout(() => {
      const interval = setInterval(() => {
        if (i <= text.length) {
          setTypedText(text.slice(0, i));
          i++;
        } else {
          clearInterval(interval);
          setTypingStep(1);
        }
      }, 75);
      return () => clearInterval(interval);
    }, 900);
    return () => clearTimeout(delay);
  }, []);

  useEffect(() => {
    if (typingStep > 0 && typingStep < 6) {
      const timer = setTimeout(() => {
        setTypingStep(prev => prev + 1);
      }, typingStep === 1 ? 400 : typingStep === 5 ? 600 : 200);
      return () => clearTimeout(timer);
    }
  }, [typingStep]);

  const handleCtaClick = () => router.push(isLoggedIn ? '/dashboard' : '/login');

  if (isChecking) {
    return (
      <div style={{ minHeight: '100vh', background: '#050810', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#00f5a0' }} />
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Syne:wght@700;800;900&display=swap');

        .f-mono { font-family: 'JetBrains Mono', 'Cascadia Code', monospace; }
        .f-display { font-family: 'Syne', system-ui, sans-serif; }

        .grid-bg {
          background-image:
            linear-gradient(rgba(0,245,160,.032) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,245,160,.032) 1px, transparent 1px);
          background-size: 52px 52px;
        }
        .text-g {
          background: linear-gradient(120deg, #00f5a0 0%, #00d4ff 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .terminal-shadow {
          box-shadow: 0 0 0 1px rgba(0,245,160,.05), 0 40px 120px rgba(0,0,0,.95), 0 0 100px rgba(0,245,160,.07);
        }
        .scan-lines {
          background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,.04) 3px, rgba(0,0,0,.04) 4px);
        }
        .cursor::after { content: '▋'; color: #00f5a0; animation: blink 1s step-end infinite; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

        @keyframes float-y { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        .float { animation: float-y 7s ease-in-out infinite; }

        @keyframes fu { from{opacity:0;transform:translateY(26px)} to{opacity:1;transform:translateY(0)} }
        .fu   { animation: fu .65s ease-out both; }
        .fu-1 { animation: fu .65s ease-out .1s both; }
        .fu-2 { animation: fu .65s ease-out .22s both; }
        .fu-3 { animation: fu .65s ease-out .36s both; }
        .fu-4 { animation: fu .65s ease-out .5s both; }
        .fu-5 { animation: fu .65s ease-out .7s both; }

        @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .ticker { animation: ticker 30s linear infinite; }
        .ticker:hover { animation-play-state: paused; }

        .cta-btn {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 14px 30px; border-radius: 14px;
          background: linear-gradient(135deg, #00f5a0 0%, #00d4ff 100%);
          color: #050810; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 15px;
          box-shadow: 0 0 32px rgba(0,245,160,.28); border: none; cursor: pointer;
          transition: box-shadow .2s, transform .2s;
        }
        .cta-btn:hover { box-shadow: 0 0 60px rgba(0,245,160,.5); transform: translateY(-2px); }

        .nav-btn {
          font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 500;
          padding: 10px 20px; border-radius: 10px;
          background: rgba(0,245,160,.06); border: 1px solid rgba(0,245,160,.22); color: #00f5a0;
          transition: background .2s; cursor: pointer;
        }
        .nav-btn:hover { background: rgba(0,245,160,.13); }

        .feat-card {
          background: #0d1117; border: 1px solid #21262d; border-radius: 18px; padding: 28px;
          transition: border-color .25s, box-shadow .25s, transform .25s; cursor: default;
        }
        .feat-card:hover { transform: translateY(-4px); }

        .install-row {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 12px 22px; border-radius: 12px; background: #161b22; border: 1px solid #21262d;
        }
        @keyframes ping-kf { 75%,100%{transform:scale(2.2);opacity:0} }
        .ping { animation: ping-kf 1.5s cubic-bezier(0,0,.2,1) infinite; }
      `}</style>

      <div className="grid-bg" style={{ minHeight: '100vh', background: '#050810', color: '#e6edf3', overflowX: 'hidden', position: 'relative' }}>

        {/* ── Glows ── */}
        <div style={{ position: 'absolute', top: -220, left: -220, width: 720, height: 720, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,245,160,.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '30%', right: -180, width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,255,.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -200, left: '20%', width: 900, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,245,160,.03) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* ── Nav ── */}
        <nav style={{ position: 'relative', zIndex: 20, maxWidth: 1280, margin: '0 auto', padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,#00f5a0,#00d4ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px rgba(0,245,160,.35)' }}>
              <Terminal size={18} color="#050810" strokeWidth={2.5} />
            </div>
            <span className="f-display" style={{ fontSize: 20, fontWeight: 800, color: '#e6edf3', letterSpacing: '-0.02em' }}>Pocket AI</span>
          </div>
          <button className="nav-btn" onClick={handleCtaClick}>
            {isLoggedIn ? t('ctaDashboard') : t('ctaStart')} →
          </button>
        </nav>

        {/* ── Hero ── */}
        <main style={{ position: 'relative', zIndex: 10, maxWidth: 1280, margin: '0 auto', padding: '44px 28px 80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 56, flexWrap: 'wrap' }}>

            {/* Left */}
            <div style={{ flex: '0 0 auto', width: 'min(100%, 460px)' }}>

              {/* Badge */}
              <div className="fu" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 100, background: 'rgba(0,245,160,.07)', border: '1px solid rgba(0,245,160,.2)', marginBottom: 28 }}>
                <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
                  <span className="ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#00f5a0', opacity: .7 }} />
                  <span style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', background: '#00f5a0', display: 'block' }} />
                </span>
                <span className="f-mono" style={{ fontSize: 11, fontWeight: 600, color: '#00f5a0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('heroBadge')}</span>
              </div>

              {/* H1 */}
              <h1 className="f-display fu-1" style={{ fontSize: 'clamp(42px,6vw,68px)', fontWeight: 900, lineHeight: 1.04, letterSpacing: '-0.03em', marginBottom: 24 }}>
                <span style={{ color: '#e6edf3' }}>{t('heroTitle').split(' ').slice(0, 3).join(' ')}</span>
                <br />
                <span className="text-g">{t('heroTitle').split(' ').slice(3).join(' ')}</span>
              </h1>

              {/* Subtitle */}
              <p className="fu-2 break-keep" style={{ fontSize: 16, lineHeight: 1.75, color: '#7d8590', marginBottom: 36, maxWidth: 430, wordBreak: 'keep-all' }}>
                {t.rich('heroSubtitle', { br: () => <br className="hidden sm:block" /> })}
              </p>

              {/* CTA */}
              <div className="fu-3" style={{ marginBottom: 32 }}>
                <button className="cta-btn" onClick={handleCtaClick}>
                  {!isLoggedIn && <Terminal size={18} strokeWidth={2.5} />}
                  {isLoggedIn ? t('ctaDashboard') : t('ctaStart')}
                  <ArrowRight size={18} />
                </button>
              </div>

              {/* Trust */}
              <div className="fu-4 f-mono" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 11, color: '#7d8590' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Lock size={12} color="#00f5a0" /> AES-256-GCM E2E</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Zap size={12} color="#00d4ff" /> Claude · Codex · Gemini</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Wifi size={12} color="#a78bfa" /> PWA · Mobile</span>
              </div>
            </div>

            {/* Right — Terminal */}
            <div className="float fu-5" style={{ flex: '1 1 380px', minWidth: 300 }}>
              <div className="terminal-shadow" style={{ background: '#0d1117', border: '1px solid rgba(0,245,160,.13)', borderRadius: 18, overflow: 'hidden' }}>
                {/* Chrome bar */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '11px 16px', background: '#161b22', borderBottom: '1px solid #21262d', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['#ff5f57', '#febc2e', '#28c840'].map(c => <div key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />)}
                  </div>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                    <span className="f-mono" style={{ fontSize: 11, padding: '3px 12px', borderRadius: 6, background: '#21262d', color: '#7d8590' }}>{t('mockupHeader')}</span>
                  </div>
                </div>

                {/* Body */}
                <div className="scan-lines f-mono" style={{ padding: '20px 24px', minHeight: 270, background: '#0d1117', fontSize: 13, lineHeight: 1.9 }}>
                  <div style={{ color: '#3d444d' }}>Last login: Fri Feb 28 at macbook.local</div>
                  <br />
                  <div>
                    <span style={{ color: '#00f5a0' }}>❯ </span>
                    <span style={{ color: '#e6edf3' }} className={typingStep === 0 ? 'cursor' : ''}>{typedText}</span>
                  </div>
                  {typingStep >= 1 && <div style={{ color: '#00d4ff' }}>✓ Authenticated  ·  Session registered</div>}
                  {typingStep >= 2 && <div style={{ color: '#7d8590' }}>{'  '}ID <span style={{ color: '#e6edf3' }}>8f3a92d1</span>{'  '}Engine <span style={{ color: '#e6edf3' }}>claude</span></div>}
                  {typingStep >= 3 && <div style={{ color: '#7d8590' }}>{t('mockupLine2')}</div>}
                  {typingStep >= 4 && <div style={{ color: '#00f5a0' }}>  ✦ {t('mockupLine3')}</div>}
                  {typingStep >= 5 && (
                    <>
                      <br />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00f5a0', display: 'inline-block' }} className={typingStep >= 6 ? 'ping' : ''} />
                        <span style={{ color: '#7d8590' }}>Waiting for remote connection</span>
                        <span className="cursor" style={{ color: '#00f5a0' }} />
                      </div>
                    </>
                  )}
                  {typingStep >= 6 && (
                    <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid #21262d', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      {[
                        { icon: <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#00f5a0' }} />, label: 'ONLINE', color: '#00f5a0' },
                        { icon: <Shield size={10} color="#00d4ff" />, label: 'E2E ENCRYPTED', color: '#00d4ff' },
                        { icon: <Wifi size={10} color="#7d8590" />, label: 'LOW LATENCY', color: '#7d8590' },
                      ].map(s => (
                        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {s.icon}
                          <span className="f-mono" style={{ fontSize: 10, color: s.color }}>{s.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 100, background: 'rgba(0,212,255,.07)', border: '1px solid rgba(0,212,255,.2)' }}>
                  <span style={{ fontSize: 14 }}>📱</span>
                  <span className="f-mono" style={{ fontSize: 11, color: '#00d4ff' }}>Control from anywhere</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* ── Ticker ── */}
        <div style={{ position: 'relative', zIndex: 10, borderTop: '1px solid #21262d', borderBottom: '1px solid #21262d', padding: '13px 0', overflow: 'hidden', background: 'rgba(0,245,160,.015)' }}>
          <div className="ticker" style={{ display: 'flex', width: 'max-content', whiteSpace: 'nowrap' }}>
            {[0, 1].map(ri => (
              <span key={ri} className="f-mono" style={{ fontSize: 11, color: '#3d444d', letterSpacing: '0.06em' }}>
                {['Claude Code', 'Codex CLI', 'Gemini CLI', 'AES-256-GCM', 'E2E Encrypted', 'WebSocket Relay', 'PWA Native', 'Mobile First', 'Free & Open'].map((item, i) => (
                  <span key={i}><span style={{ color: '#00f5a0', margin: '0 16px' }}>✦</span>{item}</span>
                ))}
              </span>
            ))}
          </div>
        </div>

        {/* ── Features ── */}
        <section style={{ position: 'relative', zIndex: 10, maxWidth: 1280, margin: '0 auto', padding: '88px 28px' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <p className="f-mono" style={{ fontSize: 11, color: '#00f5a0', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Why Pocket AI</p>
            <h2 className="f-display" style={{ fontSize: 'clamp(30px,4.5vw,50px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              <span style={{ color: '#e6edf3' }}>Built for developers,</span><br />
              <span className="text-g">secured by design</span>
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 18 }}>
            {[
              { num: '01', icon: <Lock size={20} color="#00f5a0" />, title: t('featureE2E'), desc: t('featureE2EDesc'), accent: '#00f5a0', glow: 'rgba(0,245,160,.1)' },
              { num: '02', icon: <Cpu size={20} color="#00d4ff" />, title: t('featureRealtime'), desc: t('featureRealtimeDesc'), accent: '#00d4ff', glow: 'rgba(0,212,255,.1)' },
              { num: '03', icon: <Wifi size={20} color="#a78bfa" />, title: t('featureAnywhere'), desc: t('featureAnywhereDesc'), accent: '#a78bfa', glow: 'rgba(167,139,250,.1)' },
            ].map(f => (
              <div
                key={f.num}
                className="feat-card"
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${f.accent}35`; el.style.boxShadow = `0 0 50px ${f.glow}, 0 20px 60px rgba(0,0,0,.5)`; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#21262d'; el.style.boxShadow = 'none'; }}
              >
                <div className="f-mono" style={{ fontSize: 50, fontWeight: 700, color: f.accent, opacity: 0.12, lineHeight: 1, marginBottom: 10, userSelect: 'none' }}>{f.num}</div>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: f.glow, border: `1px solid ${f.accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  {f.icon}
                </div>
                <h3 className="f-display" style={{ fontSize: 17, fontWeight: 800, color: '#e6edf3', marginBottom: 10, letterSpacing: '-0.01em' }}>{f.title}</h3>
                <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#7d8590' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Install CTA ── */}
        <section style={{ position: 'relative', zIndex: 10, maxWidth: 1280, margin: '0 auto', padding: '0 28px 96px' }}>
          <div className="grid-bg" style={{ borderRadius: 28, padding: 'clamp(40px,6vw,80px)', textAlign: 'center', position: 'relative', overflow: 'hidden', background: '#0d1117', border: '1px solid rgba(0,245,160,.13)', boxShadow: '0 0 100px rgba(0,245,160,.04)' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,245,160,.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <h2 className="f-display" style={{ fontSize: 'clamp(26px,4vw,44px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#e6edf3', marginBottom: 14 }}>
                Ready to start?
              </h2>
              <p className="f-mono" style={{ fontSize: 13, color: '#7d8590', marginBottom: 28 }}>
                Install the CLI and you&apos;re live in 60 seconds.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
                <div className="install-row">
                  <span className="f-mono" style={{ fontSize: 13, color: '#7d8590' }}>$</span>
                  <span className="f-mono" style={{ fontSize: 13, color: '#00f5a0' }}>npm install -g @pocket-ai/cli</span>
                </div>
              </div>
              <button className="cta-btn" onClick={handleCtaClick}>
                {!isLoggedIn && <Terminal size={18} strokeWidth={2.5} />}
                {isLoggedIn ? t('ctaDashboard') : t('ctaStart')}
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{ position: 'relative', zIndex: 10, maxWidth: 1280, margin: '0 auto', padding: '20px 28px', borderTop: '1px solid #21262d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,#00f5a0,#00d4ff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Terminal size={13} color="#050810" strokeWidth={2.5} />
            </div>
            <span className="f-mono" style={{ fontSize: 12, color: '#7d8590' }}>© {new Date().getFullYear()} Pocket AI</span>
          </div>
          <span className="f-mono" style={{ fontSize: 11, color: '#3d444d' }}>{t('footer')}</span>
        </footer>
      </div>
    </>
  );
}

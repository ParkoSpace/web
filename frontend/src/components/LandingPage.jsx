import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, MapPin, PhoneCall, Car, ChevronDown } from 'lucide-react';

export default function LandingPage({ currentUser, onFindParking, onPartnerClick }) {
  // Chat typing animation state
  const chatData = useRef([
    { id: 1, sender: 'Arjun', fullText: "I finally bought my first car today! I'm so happy. I just pulled into our lane… but now I can't find any parking near my home.", side: 'left', senderClass: 'text-purple-400' },
    { id: 2, sender: 'Rohan', fullText: "Yeah, man. These days getting a parking space is nearly impossible. Everywhere is full.", side: 'left', senderClass: 'text-pink-400' },
    { id: 3, sender: 'ParkoSpace', fullText: "No problem. We've got you covered! Find verified nearby parking spots instantly — safe, easy, and affordable.", side: 'right', senderClass: 'text-teal-400' }
  ]);

  const [chatMessages, setChatMessages] = useState(
    chatData.current.map(m => ({ ...m, text: '', visible: false }))
  );

  useEffect(() => {
    let active = true;

    const animateChat = async () => {
      await new Promise(r => setTimeout(r, 800));
      if (!active) return;

      for (let i = 0; i < chatData.current.length; i++) {
        // Make message visible with slide-in
        setChatMessages(prev => prev.map((msg, idx) => idx === i ? { ...msg, visible: true } : msg));

        const msg = chatData.current[i];
        let currentText = '';
        for (let charIndex = 0; charIndex < msg.fullText.length; charIndex++) {
          if (!active) return;
          currentText += msg.fullText[charIndex];
          const snapshot = currentText;
          setChatMessages(prev => prev.map((item, idx) => idx === i ? { ...item, text: snapshot } : item));
          await new Promise(r => setTimeout(r, 32));
        }
        await new Promise(r => setTimeout(r, 900));
      }
    };

    animateChat();
    return () => { active = false; };
  }, []);

  return (
    <div className="h-full text-slate-100 flex flex-col overflow-y-auto" style={{ background: 'var(--color-slate-950, #06060f)' }}>
      
      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-5 sm:px-8 py-4 flex items-center justify-between"
           style={{ background: 'rgba(6,6,15,0.82)', backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)', borderBottom: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 1px 0 rgba(255,255,255,0.03), 0 8px 32px rgba(0,0,0,0.4)' }}>
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="ParkoSpace" className="h-9 w-9 object-contain" />
          <div>
            <div className="font-display text-xl tracking-wider leading-none" style={{ color: '#00d4ff' }}>
              PARKO<span style={{ color: 'rgba(255,255,255,0.6)' }}>SPACE</span>
            </div>
            <span className="block text-[0.5rem] font-mono tracking-[0.2em] mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>PARK SMARTER · ANYWHERE</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={onPartnerClick}
            className="px-4 py-2.5 text-xs font-semibold rounded-xl transition cursor-pointer"
            style={{ border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.75)', background: 'rgba(255,255,255,0.04)' }}
          >
            {currentUser ? (
              <span className="flex flex-col items-center leading-none text-[10px] uppercase font-mono tracking-wider" style={{ color: '#00d4ff' }}>Dashboard</span>
            ) : 'Partner'}
          </button>
          <button 
            onClick={onFindParking}
            className="px-5 py-2.5 text-sm font-bold rounded-xl border-none cursor-pointer transition"
            style={{ background: '#00d4ff', color: '#05050f' }}
          >
            Find Parking
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col justify-center items-center px-6 py-28 text-center overflow-hidden">
        
        {/* Ambient blobs matching original */}
        <div className="absolute pointer-events-none" style={{ top: '10%', left: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(155,93,229,0.14), transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute pointer-events-none" style={{ bottom: '10%', right: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,212,255,0.1), transparent 70%)', filter: 'blur(60px)' }} />

        {/* Verified Badge */}
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium font-mono tracking-wider mb-8"
             style={{ border: '1px solid rgba(0,212,255,0.2)', background: 'rgba(0,212,255,0.06)', color: '#00d4ff' }}>
          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#06ffa5', boxShadow: '0 0 10px #06ffa5' }} />
          VERIFIED PARKING
        </div>

        {/* Headline */}
        <h1 className="font-display tracking-wide text-white mb-1" style={{ fontSize: 'clamp(2.2rem, 10vw, 8.5rem)', lineHeight: '0.92', letterSpacing: '0.02em' }}>
          SMART PARKING
        </h1>
        <h2 className="font-display tracking-wide mb-7" style={{ fontSize: 'clamp(2.2rem, 10vw, 8.5rem)', lineHeight: '0.92', letterSpacing: '0.02em', background: 'linear-gradient(135deg, #00d4ff 0%, #9b5de5 40%, #f72585 80%, #00d4ff 100%)', backgroundSize: '300% 300%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'gradient-shift 6s ease infinite' }}>
          REIMAGINED
        </h2>

        {/* Subtitle */}
        <p className="max-w-lg mx-auto mb-10" style={{ color: 'rgba(180,195,220,0.6)', lineHeight: '1.85', fontWeight: 300, fontSize: 'clamp(1rem, 2vw, 1.15rem)' }}>
          Your driveway is an asset.<br/>Someone else's car needs a home.<br/>
          We connect the two — <strong style={{ color: '#00d4ff', fontWeight: 600 }}>instantly.</strong>
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-wrap gap-3 justify-center items-center">
          <button 
            onClick={onFindParking}
            className="px-9 py-3.5 rounded-xl border-none cursor-pointer font-bold flex items-center gap-2 transition"
            style={{ background: '#00d4ff', color: '#05050f', fontSize: '1rem' }}
          >
            <Search className="w-5 h-5" /> Find a Spot
          </button>
          <button 
            onClick={onPartnerClick}
            className="px-9 py-3.5 rounded-xl cursor-pointer font-bold flex items-center gap-2 transition"
            style={{ border: '2px solid #f72585', color: '#f72585', background: 'transparent', fontSize: '1rem' }}
          >
            <Plus className="w-5 h-5" /> List My Space
          </button>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-7 left-1/2 -translate-x-1/2" style={{ color: 'rgba(255,255,255,0.15)', animation: 'float 3s ease-in-out infinite' }}>
          <ChevronDown className="w-7 h-7" />
        </div>
      </section>

      {/* ── THE STORY: PROBLEM & SOLUTION ── */}
      <section className="px-6 py-20" style={{ background: 'rgba(0,0,0,0.25)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-3xl mx-auto">
          
          {/* Section header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium font-mono tracking-wider mb-5"
                 style={{ border: '1px solid rgba(0,212,255,0.2)', background: 'rgba(0,212,255,0.06)', color: '#00d4ff' }}>
              THE STORY
            </div>
            <h2 className="font-display tracking-wider text-white" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', letterSpacing: '0.04em', marginBottom: '1rem' }}>
              THE <span style={{ color: '#00d4ff' }}>PROBLEM</span> & <span style={{ color: '#9b5de5' }}>SOLUTION</span>
            </h2>
            <div className="mx-auto" style={{ width: '60px', height: '3px', borderRadius: '99px', background: 'linear-gradient(90deg, #00d4ff, #9b5de5)' }} />
          </div>

          {/* Chat Container */}
          <div className="relative max-w-2xl mx-auto overflow-hidden" 
               style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', padding: 'clamp(1.5rem, 4vw, 2.2rem)', boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5), 0 24px 80px rgba(0,0,0,0.4)' }}>
            {/* Shimmer line */}
            <div className="absolute top-0 left-0 right-0 h-px pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)' }} />
            
            <div className="space-y-6">
              {chatMessages.map(msg => (
                <div 
                  key={msg.id} 
                  className="flex flex-col transition-all duration-500"
                  style={{
                    alignItems: msg.side === 'right' ? 'flex-end' : 'flex-start',
                    opacity: msg.visible ? 1 : 0,
                    transform: msg.visible ? 'translateY(0)' : 'translateY(14px)',
                  }}
                >
                  <span className={`text-[0.68rem] font-bold tracking-[0.1em] font-mono mb-1 uppercase ${msg.senderClass}`}
                        style={{ marginLeft: msg.side === 'left' ? '0.5rem' : 0, marginRight: msg.side === 'right' ? '0.5rem' : 0 }}>
                    {msg.sender}
                  </span>
                  <div 
                    className="relative"
                    style={{
                      background: msg.side === 'right' ? 'rgba(0,212,255,0.06)' : 'rgba(255,255,255,0.04)',
                      border: msg.side === 'right' ? '1px solid rgba(0,212,255,0.18)' : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: msg.side === 'right' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                      padding: '1rem 1.3rem',
                      fontSize: '0.95rem',
                      lineHeight: '1.7',
                      color: msg.side === 'right' ? '#ddeeff' : '#b8c4d6',
                      maxWidth: '86%',
                      boxShadow: msg.side === 'right' ? '0 0 24px rgba(0,212,255,0.08)' : 'none',
                    }}
                  >
                    {msg.text}
                    {msg.text.length < msg.fullText.length && msg.text.length > 0 && (
                      <span style={{ animation: 'blink 0.6s step-start infinite', color: '#00d4ff', fontSize: '0.75em' }}>▌</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="px-6 py-20" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-4xl mx-auto">
          
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium font-mono tracking-wider mb-5"
                 style={{ border: '1px solid rgba(0,212,255,0.2)', background: 'rgba(0,212,255,0.06)', color: '#00d4ff' }}>
              FOR EVERYONE
            </div>
            <h2 className="font-display tracking-wider text-white" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', letterSpacing: '0.04em', marginBottom: '1rem' }}>
              HOW IT <span style={{ color: '#00d4ff' }}>WORKS</span>
            </h2>
            <div className="mx-auto" style={{ width: '60px', height: '3px', borderRadius: '99px', background: 'linear-gradient(90deg, #00d4ff, #9b5de5)' }} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { num: '01', icon: <MapPin className="w-5 h-5" />, title: 'Find Your Area', desc: 'Search any city or neighbourhood. Verified parking spots appear on a live Google Map.', color: '#00d4ff' },
              { num: '02', icon: <PhoneCall className="w-5 h-5" />, title: 'Contact the Owner', desc: 'Call the space owner directly — no middleman, no booking fee. Just a direct phone call.', color: '#9b5de5' },
              { num: '03', icon: <Car className="w-5 h-5" />, title: 'Park & Go', desc: 'Navigate with Google Maps, reach the spot, and settle with the owner directly. Done.', color: '#06ffa5' }
            ].map(step => (
              <div 
                key={step.num} 
                className="relative overflow-hidden"
                style={{ 
                  background: 'linear-gradient(135deg, rgba(19,19,31,0.9) 0%, rgba(15,15,26,0.95) 100%)',
                  backdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '18px',
                  padding: '28px',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
                  transition: 'border-color 0.25s, transform 0.2s, box-shadow 0.25s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = `${step.color}50`;
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = `0 16px 48px rgba(0,0,0,0.5), 0 0 32px ${step.color}15`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3)';
                }}
              >
                {/* Gradient top shimmer */}
                <div className="absolute top-0 left-0 right-0 h-0.5 pointer-events-none" style={{ background: `linear-gradient(90deg, transparent, ${step.color}, transparent)` }} />
                {/* Shimmer line */}
                <div className="absolute top-0 left-[10%] right-[10%] h-px pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)' }} />
                
                <div className="font-display mb-3.5" style={{ fontSize: '3.2rem', color: step.color, opacity: 0.1, lineHeight: 1 }}>{step.num}</div>
                <div className="flex items-center justify-center mb-4" style={{ width: '42px', height: '42px', borderRadius: '12px', background: `${step.color}18`, border: `1px solid ${step.color}30` }}>
                  <span style={{ color: step.color }}>{step.icon}</span>
                </div>
                <h3 className="font-bold text-white mb-2.5" style={{ fontSize: '1rem' }}>{step.title}</h3>
                <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.38)', lineHeight: '1.8' }}>{step.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="px-6 py-12 text-center mt-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}>
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-6">
          <div className="flex items-center justify-center gap-3">
            <img src="/logo.png" alt="Logo" className="h-6 w-6 object-contain" style={{ opacity: 0.7 }} />
            <span className="font-display text-lg font-bold tracking-wider" style={{ color: '#00d4ff', letterSpacing: '0.06em' }}>PARKOSPACE</span>
          </div>

          {/* Legal Disclaimers & Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left max-w-3xl w-full border-t border-b border-slate-900/60 py-8 text-[11px] text-slate-500 leading-relaxed font-sans">
            <div>
              <h4 className="font-semibold text-slate-300 uppercase tracking-wider mb-2 font-mono">1. Terms of Use & Liability</h4>
              <p className="mb-3">
                ParkoSpace is a public peer-to-peer discovery marketplace. We are strictly NOT responsible or liable for any damage, loss, theft of vehicles/property, personal injuries, or disputes arising between parking space owners and parkers.
              </p>
              <h4 className="font-semibold text-slate-300 uppercase tracking-wider mb-2 font-mono">2. Verification Mandate</h4>
              <p>
                Parkers are advised to contact the space owner directly and verify listing details, dimensions, accessibility, and final pricing before traveling to the parking spot.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-300 uppercase tracking-wider mb-2 font-mono">3. Privacy Policy</h4>
              <p className="mb-3">
                We store only essential profile details (name, email, and phone number) to enable booking connections between users. We encrypt your passwords and do not sell your personal data to third parties.
              </p>
              <h4 className="font-semibold text-slate-300 uppercase tracking-wider mb-2 font-mono">4. Complaints & Support</h4>
              <p>
                For dispute resolution support, technical feedback, or bug reporting, please reach out to us at <a href="mailto:services@parkospace.xyz" className="text-teal-400 font-mono hover:underline hover:text-teal-400">services@parkospace.xyz</a>.
              </p>
            </div>
          </div>

          <p className="font-mono text-[10px] tracking-wider text-slate-600 mt-2">
            PARKING MARKETPLACE · MIT LICENSE · © 2026 PARKOSPACE
          </p>
        </div>
      </footer>

    </div>
  );
}

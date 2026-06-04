import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, MapPin, PhoneCall, Car, ChevronDown, DollarSign, ShieldCheck, Users, HelpCircle } from 'lucide-react';

export default function LandingPage({ currentUser, onFindParking, onPartnerClick }) {
  // Toggle between Driver and Space Owner instructions
  const [activeRole, setActiveRole] = useState('driver'); // 'driver' | 'owner'

  // Chat typing animation state
  const chatData = useRef([
    { id: 1, sender: 'Arjun', fullText: "I finally bought my first car today! I'm so happy. I just pulled into our lane… but now I can't find any parking near my home.", side: 'left', senderClass: 'text-purple-400' },
    { id: 2, sender: 'Rohan', fullText: "Yeah, man. These days getting a parking space is nearly impossible. Everywhere is full.", side: 'left', senderClass: 'text-pink-400' },
    { id: 3, sender: 'ParkoSpace', fullText: "No problem. We've got you covered! Find verified nearby parking spaces instantly — safe, easy, and affordable.", side: 'right', senderClass: 'text-teal-400' }
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
        setChatMessages(prev => prev.map((msg, idx) => idx === i ? { ...msg, visible: true } : msg));

        const msg = chatData.current[i];
        let currentText = '';
        for (let charIndex = 0; charIndex < msg.fullText.length; charIndex++) {
          if (!active) return;
          currentText += msg.fullText[charIndex];
          const snapshot = currentText;
          setChatMessages(prev => prev.map((item, idx) => idx === i ? { ...item, text: snapshot } : item));
          await new Promise(r => setTimeout(r, 24));
        }
        await new Promise(r => setTimeout(r, 900));
      }
    };

    animateChat();
    return () => { active = false; };
  }, []);

  return (
    <div className="h-full text-slate-100 flex flex-col overflow-y-auto" style={{ background: 'var(--color-slate-950, #06060f)' }}>
      
      {/* ── NAV BAR ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-8 py-3.5 flex items-center justify-between"
           style={{ background: 'rgba(6,6,15,0.85)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', borderBottom: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
        <div 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} 
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition select-none"
        >
          <img src="/logo.png" alt="ParkoSpace Logo" className="h-8 w-8 object-contain" />
          <div>
            <div className="font-display text-lg tracking-wider leading-none" style={{ color: '#00d4ff' }}>
              PARKO<span style={{ color: 'rgba(255,255,255,0.6)' }}>SPACE</span>
            </div>
            <span className="block text-[0.45rem] font-mono tracking-[0.2em] mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>RENT PRIVATE PARKING DIRECTLY</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={onPartnerClick}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl transition cursor-pointer"
            style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.03)' }}
          >
            {currentUser ? (
              <span className="flex flex-col items-center leading-none text-[9px] uppercase font-mono tracking-wider" style={{ color: '#00d4ff' }}>Dashboard</span>
            ) : 'Owner Login'}
          </button>
          <button 
            onClick={onFindParking}
            className="px-4 py-2 text-xs sm:text-sm font-bold rounded-xl border-none cursor-pointer transition hover:scale-105 active:scale-95"
            style={{ background: '#00d4ff', color: '#05050f' }}
          >
            Find Parking
          </button>
        </div>
      </nav>

      {/* ── HERO SECTION ── */}
      <section className="relative min-h-screen flex flex-col justify-center items-center px-4 sm:px-6 py-24 text-center overflow-hidden">
        {/* Background ambient light blobs */}
        <div className="absolute pointer-events-none" style={{ top: '15%', left: '-10%', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(155,93,229,0.1), transparent 70%)', filter: 'blur(50px)' }} />
        <div className="absolute pointer-events-none" style={{ bottom: '15%', right: '-10%', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,255,0.08), transparent 70%)', filter: 'blur(50px)' }} />

        {/* Verified Tag */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium font-mono tracking-wider mb-6"
             style={{ border: '1px solid rgba(0,212,255,0.25)', background: 'rgba(0,212,255,0.05)', color: '#00d4ff' }}>
          <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#06ffa5', boxShadow: '0 0 8px #06ffa5' }} />
          DIRECT PARKING MARKETPLACE
        </div>

        {/* Headline */}
        <h1 className="font-display tracking-wide text-white mb-1" style={{ fontSize: 'clamp(2.4rem, 8vw, 6rem)', lineHeight: '0.95', letterSpacing: '0.02em' }}>
          RENT PARKING
        </h1>
        <h2 className="font-display tracking-wide mb-6" style={{ fontSize: 'clamp(2.4rem, 8vw, 6rem)', lineHeight: '0.95', letterSpacing: '0.02em', background: 'linear-gradient(135deg, #00d4ff 0%, #9b5de5 45%, #f72585 85%, #00d4ff 100%)', backgroundSize: '200% 200%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'gradient-shift 8s ease infinite' }}>
          DIRECT FROM OWNERS
        </h2>

        {/* Subtitle */}
        <p className="max-w-2xl mx-auto mb-10 text-slate-400 leading-relaxed font-sans" style={{ fontSize: 'clamp(0.95rem, 2vw, 1.15rem)' }}>
          Have an empty driveway, garage, or gate front? Rent it out. <br className="hidden sm:inline"/>
          Need a cheap and secure parking space near your destination? Search, call, and park. <br className="hidden sm:inline"/>
          We connect neighbors directly — <strong style={{ color: '#00d4ff', fontWeight: 600 }}>no middleman, no fees.</strong>
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap gap-4 justify-center items-center w-full max-w-md px-4">
          <button 
            onClick={onFindParking}
            className="flex-1 min-w-[160px] px-6 py-3.5 rounded-xl border-none cursor-pointer font-bold flex items-center justify-center gap-2 transition hover:scale-105 active:scale-95"
            style={{ background: '#00d4ff', color: '#05050f', fontSize: '0.95rem', boxShadow: '0 10px 25px -5px rgba(0, 212, 255, 0.3)' }}
          >
            <Search className="w-4.5 h-4.5" /> Find Parking
          </button>
          <button 
            onClick={onPartnerClick}
            className="flex-1 min-w-[160px] px-6 py-3.5 rounded-xl cursor-pointer font-bold flex items-center justify-center gap-2 transition hover:scale-105 active:scale-95"
            style={{ border: '2px solid #f72585', color: '#f72585', background: 'transparent', fontSize: '0.95rem' }}
          >
            <Plus className="w-4.5 h-4.5" /> Add My Space
          </button>
        </div>

        {/* Floating scroll indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2" style={{ color: 'rgba(255,255,255,0.12)', animation: 'float 3s ease-in-out infinite' }}>
          <ChevronDown className="w-6 h-6" />
        </div>
      </section>

      {/* ── CORE VALUE PROPOSITION GRID ── */}
      <section className="px-4 sm:px-6 py-20" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}>
        <div className="max-w-5xl mx-auto">
          
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-mono tracking-wider mb-3.5"
                 style={{ border: '1px solid rgba(155,93,229,0.3)', background: 'rgba(155,93,229,0.05)', color: '#b280ff' }}>
              BENEFITS
            </div>
            <h2 className="font-display tracking-wider text-white text-3xl sm:text-4xl">
              WHY USE <span style={{ color: '#00d4ff' }}>PARKOSPACE</span>
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm mt-2 max-w-md mx-auto">
              Simple, transparent, and built to solve parking issues directly in your community.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: <Users className="w-5 h-5" />, title: "Direct Contact", desc: "No booking systems or corporate handlers. Call the space owner directly to align on details.", color: "#00d4ff" },
              { icon: <DollarSign className="w-5 h-5" />, title: "Zero Platform Fees", desc: "Drivers pay owners directly via Cash/UPI. 100% of the agreed price stays between you two.", color: "#06ffa5" },
              { icon: <MapPin className="w-5 h-5" />, title: "Interactive Finder", desc: "Browse nearby spots on a live map. Filter by space sizes, price rates, and amenities.", color: "#9b5de5" },
              { icon: <ShieldCheck className="w-5 h-5" />, title: "Safe & Verified", desc: "Contact numbers and addresses are verified. Built-in support guidelines prevent disputes.", color: "#f72585" }
            ].map((item, idx) => (
              <div 
                key={idx}
                className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 transition duration-300 hover:border-slate-700/80 hover:translate-y-[-2px] flex flex-col items-start"
                style={{ backdropFilter: 'blur(10px)' }}
              >
                <div className="p-2.5 rounded-xl mb-4" style={{ background: `${item.color}15`, border: `1px solid ${item.color}25`, color: item.color }}>
                  {item.icon}
                </div>
                <h3 className="font-bold text-slate-100 text-sm mb-2 font-mono uppercase tracking-wider">{item.title}</h3>
                <p className="text-slate-400 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ── CHOOSE YOUR PATH (DIVERS VS OWNERS SELECTION) ── */}
      <section className="px-4 sm:px-6 py-16">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Driver Selection Card */}
          <div className="relative group overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 hover:border-teal-500/30"
               style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
            <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full filter blur-xl group-hover:bg-teal-500/10 transition" />
            <div>
              <div className="text-[10px] font-mono tracking-widest text-teal-400 font-bold uppercase mb-2">Need a Spot?</div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Looking for Parking</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed mb-6">
                Avoid circling the block. Search the map for nearby private driveways or gates, call the owner to verify availability, and park. It is cheaper and faster.
              </p>
            </div>
            <button 
              onClick={onFindParking}
              className="w-full bg-teal-900/20 hover:bg-teal-500 text-teal-400 hover:text-slate-950 font-bold text-xs py-3 rounded-xl transition flex items-center justify-center gap-1.5 border border-teal-500/20 group-hover:border-teal-500 cursor-pointer"
            >
              <Search className="w-4 h-4" /> Start Finding Parking
            </button>
          </div>

          {/* Owner Selection Card */}
          <div className="relative group overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 hover:border-pink-500/30"
               style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
            <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/5 rounded-full filter blur-xl group-hover:bg-pink-500/10 transition" />
            <div>
              <div className="text-[10px] font-mono tracking-widest text-pink-400 font-bold uppercase mb-2">Have Empty Space?</div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Rent Your Parking Space</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed mb-6">
                Turn your empty gate front, garage, or driveway into extra cash. Add your space in minutes, set your own hourly or monthly rates, and get calls from local drivers.
              </p>
            </div>
            <button 
              onClick={onPartnerClick}
              className="w-full bg-pink-900/20 hover:bg-pink-500 text-pink-400 hover:text-white font-bold text-xs py-3 rounded-xl transition flex items-center justify-center gap-1.5 border border-pink-500/20 group-hover:border-pink-500 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add My Space Now
            </button>
          </div>

        </div>
      </section>

      {/* ── HOW IT WORKS: DUAL FLOW ── */}
      <section className="px-4 sm:px-6 py-20 bg-slate-900/20 border-t border-slate-900/60" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-4xl mx-auto">
          
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-mono tracking-wider mb-3.5"
                 style={{ border: '1px solid rgba(0,212,255,0.3)', background: 'rgba(0,212,255,0.05)', color: '#00d4ff' }}>
              OPERATIONS
            </div>
            <h2 className="font-display tracking-wider text-white text-3xl sm:text-4xl">
              HOW IT <span style={{ color: '#00d4ff' }}>WORKS</span>
            </h2>
            
            {/* Pill Toggles */}
            <div className="flex bg-slate-950/80 p-1 rounded-xl max-w-xs mx-auto border border-slate-800/80 mt-6 select-none">
              <button
                onClick={() => setActiveRole('driver')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeRole === 'driver' 
                    ? 'bg-teal-600 text-slate-100 shadow' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                I Need Parking
              </button>
              <button
                onClick={() => setActiveRole('owner')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeRole === 'owner' 
                    ? 'bg-teal-600 text-slate-100 shadow' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                I Have Empty Space
              </button>
            </div>
          </div>

          {/* Tab content wrapper */}
          <div className="transition-all duration-300">
            {activeRole === 'driver' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { num: '1', icon: <Search className="w-5 h-5 text-teal-400" />, title: 'Find Location', desc: 'Open the map, enter your target city or landmark, and view nearby private parking spots.' },
                  { num: '2', icon: <PhoneCall className="w-5 h-5 text-purple-400" />, title: 'Call Owner Directly', desc: 'Tap to view details, then call the owner to confirm parameters, pricing, and access hours.' },
                  { num: '3', icon: <Car className="w-5 h-5 text-green-400" />, title: 'Navigate & Park', desc: 'Tap Navigate to launch driving directions directly, park, and pay the owner directly.' }
                ].map((item, idx) => (
                  <div key={idx} className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 relative">
                    <span className="absolute top-4 right-4 text-3xl font-bold font-mono text-slate-800 select-none">{item.num}</span>
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
                      {item.icon}
                    </div>
                    <h4 className="font-bold text-white text-sm mb-2">{item.title}</h4>
                    <p className="text-slate-400 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { num: '1', icon: <Plus className="w-5 h-5 text-pink-400" />, title: 'Add Space Details', desc: 'Login, tap Add Space, and input your rates (hourly/monthly), landmarks, and amenities.' },
                  { num: '2', icon: <MapPin className="w-5 h-5 text-purple-400" />, title: 'Verify Location', desc: 'Use the quick GPS tool to fetch coordinates or paste a link so drivers find your gate easily.' },
                  { num: '3', icon: <DollarSign className="w-5 h-5 text-green-400" />, title: 'Get Calls & Earn', desc: 'Your spot shows up on the live map. Local drivers call your phone directly to rent it.' }
                ].map((item, idx) => (
                  <div key={idx} className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 relative">
                    <span className="absolute top-4 right-4 text-3xl font-bold font-mono text-slate-800 select-none">{item.num}</span>
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
                      {item.icon}
                    </div>
                    <h4 className="font-bold text-white text-sm mb-2">{item.title}</h4>
                    <p className="text-slate-400 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </section>

      {/* ── THE STORY: PROBLEM & SOLUTION ── */}
      <section className="px-4 sm:px-6 py-20 bg-slate-950" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-3xl mx-auto">
          
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium font-mono tracking-wider mb-4"
                 style={{ border: '1px solid rgba(0,212,255,0.2)', background: 'rgba(0,212,255,0.06)', color: '#00d4ff' }}>
              REAL DILEMMA
            </div>
            <h2 className="font-display tracking-wider text-white text-2xl sm:text-3xl">
              REALITY IN INDIAN CITIES
            </h2>
            <div className="mx-auto mt-3" style={{ width: '40px', height: '2px', borderRadius: '99px', background: 'linear-gradient(90deg, #00d4ff, #9b5de5)' }} />
          </div>

          {/* Chat Container */}
          <div className="relative max-w-xl mx-auto overflow-hidden" 
               style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', padding: 'clamp(1.2rem, 3vw, 2rem)', boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6), 0 20px 50px rgba(0,0,0,0.4)' }}>
            
            <div className="space-y-4">
              {chatMessages.map(msg => (
                <div 
                  key={msg.id} 
                  className="flex flex-col transition-all duration-500"
                  style={{
                    alignItems: msg.side === 'right' ? 'flex-end' : 'flex-start',
                    opacity: msg.visible ? 1 : 0,
                    transform: msg.visible ? 'translateY(0)' : 'translateY(10px)',
                  }}
                >
                  <span className={`text-[10px] font-bold tracking-[0.08em] font-mono mb-1 uppercase ${msg.senderClass}`}
                        style={{ marginLeft: msg.side === 'left' ? '0.4rem' : 0, marginRight: msg.side === 'right' ? '0.4rem' : 0 }}>
                    {msg.sender}
                  </span>
                  <div 
                    className="relative text-xs sm:text-sm leading-relaxed"
                    style={{
                      background: msg.side === 'right' ? 'rgba(0,212,255,0.06)' : 'rgba(255,255,255,0.04)',
                      border: msg.side === 'right' ? '1px solid rgba(0,212,255,0.18)' : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: msg.side === 'right' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                      padding: '12px 16px',
                      color: msg.side === 'right' ? '#ddeeff' : '#b8c4d6',
                      maxWidth: '88%',
                      boxShadow: msg.side === 'right' ? '0 0 20px rgba(0,212,255,0.06)' : 'none',
                    }}
                  >
                    {msg.text}
                    {msg.text.length < msg.fullText.length && msg.text.length > 0 && (
                      <span className="text-teal-400 font-bold ml-0.5 animate-pulse">|</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="px-4 sm:px-6 py-12 text-center mt-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}>
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-6">
          <div 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} 
            className="flex items-center justify-center gap-2 cursor-pointer hover:opacity-90 transition select-none"
          >
            <img src="/logo.png" alt="ParkoSpace Logo" className="h-5 w-5 object-contain opacity-70" />
            <span className="font-display text-base font-bold tracking-wider" style={{ color: '#00d4ff', letterSpacing: '0.04em' }}>PARKOSPACE</span>
          </div>

          {/* Disclaimers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left max-w-3xl w-full border-t border-b border-slate-900/60 py-8 text-[10px] text-slate-500 leading-relaxed font-sans select-none">
            <div>
              <h4 className="font-semibold text-slate-300 uppercase tracking-wider mb-2.5 font-mono">1. Terms of Use & Liability</h4>
              <p className="mb-3.5">
                ParkoSpace is a public peer-to-peer discovery marketplace. We are strictly NOT responsible or liable for any damage, loss, theft of vehicles/property, personal injuries, or disputes arising between parking space owners and parkers.
              </p>
              <h4 className="font-semibold text-slate-300 uppercase tracking-wider mb-2.5 font-mono">2. Verification Mandate</h4>
              <p>
                Parkers are advised to contact the space owner directly and verify parking space details, size, accessibility, and final price before traveling to the parking space.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-300 uppercase tracking-wider mb-2.5 font-mono">3. Privacy Policy</h4>
              <p className="mb-3.5">
                We store only essential profile details (name, email, and phone number) to enable booking connections between users. We encrypt your passwords and do not sell your personal data to third parties.
              </p>
              <h4 className="font-semibold text-slate-300 uppercase tracking-wider mb-2.5 font-mono">4. Complaints & Support</h4>
              <p>
                For dispute resolution support, technical feedback, or bug reporting, please reach out to us at <a href="mailto:services@parkospace.xyz" className="text-teal-400 font-mono hover:underline hover:text-teal-400">services@parkospace.xyz</a>.
              </p>
            </div>
          </div>

          <p className="font-mono text-[9px] tracking-wider text-slate-600 mt-2">
            PARKING MARKETPLACE · PROPRIETARY & CLOSED SOURCE · © 2026 PARKOSPACE
          </p>
        </div>
      </footer>

    </div>
  );
}

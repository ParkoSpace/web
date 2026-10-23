import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, Loader, CreditCard, Landmark, ShieldCheck, HelpCircle } from 'lucide-react';

export default function CreditsPage({ currentUser, onUpdateUser, onBack }) {
  const [amount, setAmount] = useState(100); // Default predefined
  const [customInput, setCustomInput] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [paymentTab, setPaymentTab] = useState('card'); // 'card' | 'upi'
  const [loading, setLoading] = useState(false);
  const [paymentStep, setPaymentStep] = useState(0); // 0 = idle, 1 = validating, 2 = banking, 3 = complete
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [txnId, setTxnId] = useState('');

  // Card form details
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // UPI details
  const [upiId, setUpiId] = useState('');

  // Localization detection
  const [isIndia, setIsIndia] = useState(true);

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const isIndianTz = tz.includes('Calcutta') || tz.includes('Kolkata') || tz.includes('Asia/Kolkata');
      const isIndianLang = navigator.language === 'en-IN' || navigator.language === 'hi-IN';
      setIsIndia(isIndianTz || isIndianLang);
    } catch (e) {
      setIsIndia(true);
    }
  }, []);

  const getPrice = (qty) => {
    return (qty * 0.5).toFixed(2);
  };

  const handleSelectPackage = (qty) => {
    setIsCustom(false);
    setAmount(qty);
    setError('');
  };

  const handleCustomChange = (e) => {
    const val = e.target.value.replace(/\D/g, '');
    setCustomInput(val);
    setAmount(val ? parseInt(val) : 0);
    setError('');
  };

  // Format Card Number (adds spaces every 4 digits)
  const handleCardNumberChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 16);
    const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
    setCardNumber(formatted);
  };

  // Format Card Expiry (MM/YY)
  const handleCardExpiryChange = (e) => {
    let val = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (val.length >= 2) {
      val = val.slice(0, 2) + '/' + val.slice(2);
    }
    setCardExpiry(val);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      setError('Please select or enter a valid number of credits.');
      return;
    }

    if (paymentTab === 'card') {
      if (!cardName.trim() || cardNumber.replace(/\s/g, '').length !== 16 || cardExpiry.length !== 5 || cardCvv.length !== 3) {
        setError('Please enter complete credit card checkout details.');
        return;
      }
    } else {
      if (!upiId.trim() || !upiId.includes('@')) {
        setError('Please enter a valid UPI address (e.g. username@bank).');
        return;
      }
    }

    setLoading(true);
    setError('');
    setPaymentStep(1);

    // Simulated checkout step transitions for high visual quality
    setTimeout(() => {
      setPaymentStep(2);
      setTimeout(async () => {
        try {
          const response = await fetch('/api/credits/purchase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount })
          });
          const data = await response.json();
          if (response.ok && data.success) {
            setTxnId('TXN-' + Math.floor(10000000 + Math.random() * 90000000));
            setPaymentStep(3);
            setSuccess(true);
            if (onUpdateUser && currentUser) {
              onUpdateUser({
                ...currentUser,
                credits: data.credits
              });
            }
          } else {
            setError(data.error || 'Checkout transaction rejected.');
            setPaymentStep(0);
            setLoading(false);
          }
        } catch (err) {
          setError('Connection error. Please verify server status.');
          setPaymentStep(0);
          setLoading(false);
        }
      }, 1200);
    }, 800);
  };

  const isPreviousUser = currentUser && (currentUser.joined_at < 1780627200 || !currentUser.joined_at);
  const currentPrice = getPrice(amount);

  return (
    <div className="h-full overflow-y-auto bg-[#06060f] text-slate-100 flex flex-col font-sans">
      
      {/* Upper Navigation Header */}
      <header className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3 sm:gap-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 transition flex items-center gap-1 cursor-pointer font-semibold text-xs border border-slate-800"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go Back</span>
          </button>
          <div className="flex items-center gap-2 select-none">
            <img src="/logo.png" alt="ParkoSpace" className="h-6 w-6 object-contain" />
          </div>
        </div>
        <div className="text-xs text-slate-500 font-mono hidden md:block">
          SECURE SANDBOX CHECKOUT GATEWAY
        </div>
      </header>

      {/* Main Grid View */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 md:py-12 flex flex-col justify-center">
        
        {success ? (
          /* Receipt panel */
          <div className="max-w-md w-full mx-auto bg-slate-950 border border-slate-850 rounded-3xl p-8 shadow-2xl text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-teal-950/40 border border-teal-500/30 rounded-full flex items-center justify-center mx-auto mb-6 text-teal-400">
              <CheckCircle className="w-8 h-8 text-teal-400" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2">Recharge Completed!</h2>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              We have credited <strong className="text-teal-400">{amount} credits</strong> to your account successfully.
            </p>

            {/* Receipt details */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 mb-8 text-left space-y-3 font-mono text-xs text-slate-400">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span>Receipt Number:</span>
                <span className="text-slate-200 font-semibold">{txnId}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span>Date:</span>
                <span className="text-slate-200">{new Date().toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span>Credits Added:</span>
                <span className="text-teal-400 font-bold">🪙 {amount}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span>Amount Paid:</span>
                <span className="text-white font-semibold">{isIndia ? `₹${currentPrice} INR` : `$${currentPrice} USD`}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span>New Balance:</span>
                <span className="text-teal-400 font-bold">🪙 {currentUser?.credits || 0}</span>
              </div>
            </div>

            <button
              onClick={onBack}
              className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs py-3.5 rounded-2xl transition cursor-pointer shadow-lg shadow-teal-950/20"
            >
              Return to App
            </button>
          </div>
        ) : (
          /* Checkout Split Page */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-stretch">
            
            {/* Left Column: Balance Info & Packages */}
            <section className="md:col-span-6 flex flex-col justify-between space-y-8">
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    Recharge Balance
                  </h1>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Select a credit package or enter a custom balance amount. Credits can be used immediately across all parkings.
                  </p>
                </div>

                {/* Account welcome status info card */}
                <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-5 flex items-center justify-between shadow-sm">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Account Owner</span>
                    <div className="text-sm font-bold text-slate-100">{currentUser?.name}</div>
                    <div className="text-xs text-slate-400 font-mono">{currentUser?.phone}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 text-center min-w-28">
                    <span className="text-[9px] uppercase font-mono tracking-wider text-slate-500 block mb-1">Active Balance</span>
                    <span className="text-xs font-mono font-bold text-teal-400">
                      🪙 {isPreviousUser ? 'UNLIMITED' : (currentUser?.credits || 0)}
                    </span>
                  </div>
                </div>

                {isPreviousUser ? (
                  /* Notification card for pre-migration accounts */
                  <div className="bg-teal-950/30 border border-teal-500/20 text-teal-400 rounded-2xl p-5 text-xs leading-relaxed space-y-2">
                    <div className="font-bold flex items-center gap-1.5 uppercase font-mono text-[10px] tracking-wider text-teal-350">
                      <span>✓</span> Previous Account Exemption
                    </div>
                    <p>
                      Your account was registered before the monetization model was introduced. You have **unlimited access** to all navigation utilities and space listing actions forever. No billing recharge is required!
                    </p>
                  </div>
                ) : (
                  /* Credit Packages Selector */
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs font-semibold uppercase font-mono tracking-wider text-slate-450 block mb-3">
                        Choose a Credit Package
                      </span>
                      <div className="grid grid-cols-3 gap-3">
                        {[100, 500, 1000].map((qty) => (
                          <button
                            key={qty}
                            type="button"
                            onClick={() => handleSelectPackage(qty)}
                            className={`flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl border text-center transition cursor-pointer ${
                              !isCustom && amount === qty
                                ? 'border-teal-500 bg-teal-950/20 text-white shadow-lg shadow-teal-950/10'
                                : 'border-slate-850 bg-slate-950 hover:border-slate-800 text-slate-450 hover:text-slate-250'
                            }`}
                          >
                            <span className="text-sm font-mono font-bold">{qty}</span>
                            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-mono mt-0.5">credits</span>
                            <span className="text-[11px] font-mono font-bold text-teal-450 mt-3">
                              {isIndia ? `₹${getPrice(qty)}` : `$${getPrice(qty)}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Input */}
                    <div className="border-t border-slate-900 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustom(true);
                          setAmount(customInput ? parseInt(customInput) : 0);
                          setError('');
                        }}
                        className={`text-xs font-semibold uppercase tracking-wider font-mono flex items-center gap-1.5 transition ${
                          isCustom ? 'text-teal-400' : 'text-slate-500 hover:text-slate-350'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                        Enter Custom Credits Amount
                      </button>

                      {isCustom && (
                        <div className="mt-3 relative animate-in slide-in-from-top-2 duration-200">
                          <input
                            type="text"
                            required={isCustom}
                            placeholder="e.g. 250"
                            value={customInput}
                            onChange={handleCustomChange}
                            className="w-full bg-slate-950 border border-slate-850 rounded-2xl py-3.5 px-5 text-sm font-mono text-slate-100 placeholder-slate-650 outline-none focus:border-teal-500 transition"
                          />
                          <span className="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 uppercase tracking-widest">
                            Credits
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Safety notice info card footer */}
              <div className="flex gap-3 text-slate-500 text-[10px] leading-relaxed pt-6 border-t border-slate-900">
                <ShieldCheck className="w-8 h-8 text-slate-650 flex-shrink-0" />
                <p>
                  All simulated payments are processed in sandbox mock mode. No real money or bank transactions will occur. Credits will be loaded immediately to your account database.
                </p>
              </div>
            </section>

            {/* Right Column: Checkout Simulated Form */}
            <section className="md:col-span-6">
              {isPreviousUser ? (
                /* Disabled checkout panel for unlimited users */
                <div className="h-full bg-slate-950/40 border border-slate-900 rounded-3xl p-8 flex flex-col justify-center items-center text-center space-y-4">
                  <div className="text-3xl">🛡️</div>
                  <h3 className="font-bold text-white text-sm uppercase font-mono tracking-wider">Billing Disabled</h3>
                  <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                    Recharging is not required for your account since your previous registration grants unlimited maps actions and driveway listings.
                  </p>
                  <button
                    onClick={onBack}
                    className="px-6 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white text-xs font-bold transition cursor-pointer"
                  >
                    Go Back
                  </button>
                </div>
              ) : (
                /* Active Checkout panel */
                <div className="bg-slate-950 border border-slate-850 rounded-3xl p-6 md:p-8 shadow-2xl">
                  
                  {loading && paymentStep < 3 ? (
                    /* Checkout processing loader view */
                    <div className="py-20 text-center space-y-6">
                      <Loader className="w-10 h-10 animate-spin text-teal-400 mx-auto" />
                      <div className="space-y-1.5">
                        <h3 className="font-bold text-white text-sm font-mono uppercase tracking-widest">
                          {paymentStep === 1 ? 'Validating details...' : 'Authorizing billing...'}
                        </h3>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {paymentStep === 1 ? 'Initiating handshake with secure gateway...' : 'Verifying simulated vault transaction records...'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Checkout Form */
                    <form onSubmit={handlePaymentSubmit} className="space-y-6">
                      
                      {/* Payment Tabs Selector */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-1.5 rounded-2xl border border-slate-850">
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentTab('card');
                            setError('');
                          }}
                          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                            paymentTab === 'card'
                              ? 'bg-slate-950 text-white border border-slate-800/80 shadow-md'
                              : 'text-slate-450 hover:text-slate-200'
                          }`}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Credit Card</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentTab('upi');
                            setError('');
                          }}
                          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                            paymentTab === 'upi'
                              ? 'bg-slate-950 text-white border border-slate-800/80 shadow-md'
                              : 'text-slate-450 hover:text-slate-200'
                          }`}
                        >
                          <Landmark className="w-3.5 h-3.5" />
                          <span>UPI Payment</span>
                        </button>
                      </div>

                      {/* Payment Inputs */}
                      {paymentTab === 'card' ? (
                        /* Card Form Inputs */
                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500">
                              Cardholder Name
                            </label>
                            <input
                              type="text"
                              required={paymentTab === 'card'}
                              placeholder="e.g. ARJUN SHARMA"
                              value={cardName}
                              onChange={(e) => setCardName(e.target.value.toUpperCase())}
                              className="w-full bg-slate-900/40 border border-slate-850 rounded-xl py-3 px-4 text-xs text-white outline-none focus:border-teal-500 transition placeholder-slate-700"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500">
                              Card Number
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                required={paymentTab === 'card'}
                                placeholder="4000 1234 5678 9010"
                                value={cardNumber}
                                onChange={handleCardNumberChange}
                                className="w-full bg-slate-900/40 border border-slate-850 rounded-xl py-3 px-4 text-xs font-mono text-white outline-none focus:border-teal-500 transition placeholder-slate-700"
                              />
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-600">
                                VISA / MC
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500">
                                Expiry Date
                              </label>
                              <input
                                type="text"
                                required={paymentTab === 'card'}
                                placeholder="MM/YY"
                                value={cardExpiry}
                                onChange={handleCardExpiryChange}
                                className="w-full bg-slate-900/40 border border-slate-850 rounded-xl py-3 px-4 text-xs font-mono text-white outline-none focus:border-teal-500 transition text-center placeholder-slate-700"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500">
                                Security Code (CVV)
                              </label>
                              <input
                                type="password"
                                required={paymentTab === 'card'}
                                placeholder="•••"
                                value={cardCvv}
                                onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 3))}
                                className="w-full bg-slate-900/40 border border-slate-850 rounded-xl py-3 px-4 text-xs font-mono text-white outline-none focus:border-teal-500 transition text-center placeholder-slate-700"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* UPI Input */
                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500">
                              UPI Virtual Payment Address
                            </label>
                            <input
                              type="text"
                              required={paymentTab === 'upi'}
                              placeholder="e.g. arjun@upi"
                              value={upiId}
                              onChange={(e) => setUpiId(e.target.value.toLowerCase())}
                              className="w-full bg-slate-900/40 border border-slate-850 rounded-xl py-3.5 px-4 text-xs font-mono text-white outline-none focus:border-teal-500 transition placeholder-slate-750"
                            />
                            <p className="text-[9px] text-slate-500 leading-relaxed font-mono">
                              UPI ID can be found inside your Google Pay, PhonePe, or Paytm account details.
                            </p>
                          </div>
                        </div>
                      )}

                      {error && (
                        <div className="px-4 py-2.5 bg-red-950/20 border border-red-500/25 text-red-400 text-xs rounded-xl font-medium">
                          {error}
                        </div>
                      )}

                      {/* Total Cost Checkout Summary */}
                      <div className="border-t border-slate-900 pt-5 space-y-4">
                        <div className="flex justify-between items-center text-xs font-mono">
                          <span className="text-slate-400">Total Purchase:</span>
                          <span className="text-white font-semibold">{amount || 0} credits</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-mono text-slate-400">Total Checkout Price:</span>
                          <span className="text-base font-mono font-bold text-white">
                            {isIndia ? `₹${currentPrice} INR` : `$${currentPrice} USD`}
                          </span>
                        </div>

                        <button
                          type="submit"
                          className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs py-3.5 rounded-2xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer shadow-teal-950/25"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>Pay & Add Credits</span>
                        </button>

                        <div className="text-center">
                          <span className="text-[10px] font-mono text-slate-500">
                            Exchange Rate: 1 credit = {isIndia ? '₹0.50 INR' : '$0.50 USD'}
                          </span>
                        </div>
                      </div>

                    </form>
                  )}

                </div>
              )}
            </section>

          </div>
        )}

      </main>

    </div>
  );
}

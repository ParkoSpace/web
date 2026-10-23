import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Loader, DollarSign, CreditCard } from 'lucide-react';

export default function CreditsModal({ isOpen, onClose, currentUser, onUpdateUser }) {
  const [amount, setAmount] = useState(100); // Default package
  const [customInput, setCustomInput] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Detect if user is in India based on timezone/locale
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

  if (!isOpen) return null;

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

  const handlePurchase = async (e) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      setError('Please select or enter a valid number of credits.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const response = await fetch('/api/credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setSuccess(true);
        if (onUpdateUser && currentUser) {
          onUpdateUser({
            ...currentUser,
            credits: data.credits
          });
        }
      } else {
        setError(data.error || 'Failed to complete credit purchase.');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const currentPrice = getPrice(amount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🪙</span>
            <span className="font-bold text-white tracking-wide text-sm font-mono uppercase">Add Credits</span>
          </div>
          <button 
            onClick={() => {
              setSuccess(false);
              onClose();
            }} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-teal-950/50 border border-teal-500/30 rounded-full flex items-center justify-center mx-auto mb-4 text-teal-400">
                <CheckCircle className="w-8 h-8 text-teal-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Purchase Successful!</h3>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Added <strong className="text-teal-400 font-semibold">{amount} credits</strong> to your account.<br />
                <span className="text-[10px] text-slate-500 italic">Sandbox Mode: Simulated payment processed successfully.</span>
              </p>
              <button
                onClick={() => {
                  setSuccess(false);
                  onClose();
                }}
                className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer"
              >
                Close Window
              </button>
            </div>
          ) : (
            <form onSubmit={handlePurchase} className="space-y-6">
              {/* Header Details */}
              <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3.5 flex justify-between items-center">
                <div className="text-xs text-slate-400">
                  Current Balance:
                </div>
                <div className="text-sm font-mono font-bold text-teal-400">
                  🪙 {currentUser?.credits || 0} credits
                </div>
              </div>

              {/* Package Selectors */}
              <div>
                <label className="block text-xs font-semibold text-slate-350 tracking-wider font-mono mb-3 uppercase">Select Package</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[100, 500, 1000].map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => handleSelectPackage(qty)}
                      className={`flex flex-col items-center p-3 rounded-xl border text-center transition cursor-pointer ${
                        !isCustom && amount === qty
                          ? 'border-teal-500 bg-teal-950/20 text-white'
                          : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="text-xs font-mono font-bold">{qty}</span>
                      <span className="text-[9px] uppercase tracking-wider text-slate-500 mt-1">credits</span>
                      <span className="text-[10px] font-mono font-bold text-teal-400 mt-2">
                        {isIndia ? `₹${getPrice(qty)}` : `$${getPrice(qty)}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Input Option */}
              <div className="border-t border-slate-800/60 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsCustom(true);
                    setAmount(customInput ? parseInt(customInput) : 0);
                  }}
                  className={`text-xs font-semibold uppercase tracking-wider font-mono flex items-center gap-1.5 transition ${
                    isCustom ? 'text-teal-400' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  Or Enter Custom Amount
                </button>

                {isCustom && (
                  <div className="mt-3 relative animate-in slide-in-from-top-2 duration-200">
                    <input
                      type="text"
                      required={isCustom}
                      placeholder="Enter credits e.g. 250"
                      value={customInput}
                      onChange={handleCustomChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm font-mono text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 transition"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 uppercase">
                      Credits
                    </span>
                  </div>
                )}
              </div>

              {error && (
                <div className="px-4 py-2.5 bg-red-950/30 border border-red-500/30 text-red-400 text-xs rounded-xl">
                  {error}
                </div>
              )}

              {/* Purchase Button */}
              <div className="border-t border-slate-800/80 pt-4">
                <div className="flex justify-between items-center mb-4 text-xs font-mono">
                  <span className="text-slate-400">Total Price:</span>
                  <span className="text-sm font-bold text-white">
                    {isIndia ? `₹${currentPrice} INR` : `$${currentPrice} USD`}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs py-3.5 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  {loading ? 'Processing...' : 'Pay & Add Credits'}
                </button>
                <p className="text-[10px] text-slate-500 text-center mt-2.5">
                  Rate: 1 credit = {isIndia ? '₹0.50 INR' : '$0.50 USD'}
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

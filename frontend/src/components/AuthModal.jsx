import React, { useState } from 'react';
import { X, Mail, Phone, Lock, User, Eye, EyeOff, Loader, CheckCircle } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onSuccess, initialTab = 'login', onBackToHome, onFindParking }) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'login' | 'register'
  const [step, setStep] = useState(1); // 1: Info, 2: OTP (for Register or Forgot Password)
  const [isForgot, setIsForgot] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setPassword('');
    setOtpCode('');
    setNewPassword('');
    setTermsAccepted(false);
    setError('');
    setMessage('');
    setStep(1);
    setIsForgot(false);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    resetForm();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Step 1: Login
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        onSuccess(data.user);
        handleClose();
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Register (Validate & Send OTP)
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!name || !phone || !email || !password) {
      setError('All fields are required.');
      return;
    }
    if (phone.length < 10) {
      setError('Phone number must be at least 10 digits.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!termsAccepted) {
      setError('You must agree to the Terms & Conditions to proceed.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      // First check duplicates
      const dupRes = await fetch('/api/auth/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone })
      });
      const dupData = await dupRes.json();
      if (dupData.duplicate) {
        setError(dupData.message);
        setLoading(false);
        return;
      }

      // Send OTP
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email, password })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setMessage(`We have sent a verification code to ${email}`);
        setStep(2);
      } else {
        setError(data.error || 'Failed to send verification code.');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Register Verify (Verify OTP & Create account)
  const handleRegisterVerify = async (e) => {
    e.preventDefault();
    if (!otpCode) {
      setError('Please enter the verification code.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email, password, code: otpCode })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        onSuccess(data.user);
        handleClose();
      } else {
        setError(data.error || 'Verification failed');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Forgot Password (Request OTP)
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Email is required.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setMessage(`Reset code sent to ${email}`);
        setStep(2);
      } else {
        setError(data.error || 'Failed to send reset code.');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Reset Password (Verify OTP & Set new password)
  const handleResetVerify = async (e) => {
    e.preventDefault();
    if (!otpCode || !newPassword) {
      setError('All fields are required.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode, new_password: newPassword })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        onSuccess(data.user);
        handleClose();
      } else {
        setError(data.error || 'Reset failed');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div 
            onClick={() => { if (onBackToHome) { onBackToHome(); } else { onClose(); } }}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition select-none"
          >
            <img src="/logo.png" alt="ParkoSpace" className="h-6 w-6 object-contain" />
            <span className="font-bold text-teal-400 tracking-wider text-sm font-mono">PARKOSPACE</span>
          </div>
          <button 
            onClick={handleClose} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form area */}
        <div className="p-6 max-h-[calc(100vh-130px)] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {/* Owners-only Warning Notice */}
          <div className="mb-5 p-3.5 bg-teal-950/30 border border-teal-500/20 rounded-xl text-[11px] text-slate-355 leading-relaxed flex gap-2 shadow-inner">
            <span className="text-teal-400 font-bold flex-shrink-0">Notice:</span>
            <span>
              This login and registration is <strong className="text-teal-400 font-semibold">only for parking space owners</strong>. If you want to search for parking, please{' '}
              <button 
                type="button" 
                onClick={() => { if (onFindParking) onFindParking(); else onClose(); }}
                className="text-teal-450 hover:text-teal-400 font-bold underline inline cursor-pointer outline-none border-none bg-transparent p-0"
              >
                click here
              </button>.
            </span>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-950/30 border border-red-500/30 text-red-400 text-xs rounded-xl flex items-start gap-2.5">
              <span className="font-bold text-red-500 mt-0.5">✕</span>
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="mb-4 px-4 py-3 bg-teal-950/30 border border-teal-500/30 text-teal-300 text-xs rounded-xl flex items-start gap-2.5">
              <CheckCircle className="w-4 h-4 text-teal-400 flex-shrink-0 mt-0.5" />
              <span>{message}</span>
            </div>
          )}

          {!isForgot ? (
            // STANDARD LOGIN / REGISTRATION FLOW
            <>
              {step === 1 && (
                <>
                  {/* Tabs */}
                  <div className="flex bg-slate-950 p-1 rounded-xl mb-6 border border-slate-800/80">
                    <button
                      onClick={() => handleTabChange('login')}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                        activeTab === 'login' 
                          ? 'bg-teal-600 text-white shadow' 
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Login
                    </button>
                    <button
                      onClick={() => handleTabChange('register')}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                        activeTab === 'register' 
                          ? 'bg-teal-600 text-white shadow' 
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Register
                    </button>
                  </div>

                  {activeTab === 'login' ? (
                    <form onSubmit={handleLoginSubmit} className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type="email"
                            required
                            placeholder="name@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="block text-xs font-medium text-slate-300">Password</label>
                          <button
                            type="button"
                            onClick={() => setIsForgot(true)}
                            className="text-xs text-teal-400 hover:text-teal-300 font-medium"
                          >
                            Forgot Password?
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            placeholder="••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-10 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm py-3 px-4 rounded-xl shadow-lg shadow-teal-900/20 hover:shadow-teal-900/30 transition flex items-center justify-center gap-2 cursor-pointer mt-6"
                      >
                        {loading && <Loader className="w-4 h-4 animate-spin" />}
                        {loading ? 'Logging in...' : 'Sign In'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleRegisterSubmit} className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
                        <div className="relative">
                          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type="text"
                            required
                            placeholder="John Doe"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">Phone Number</label>
                        <div className="relative">
                          <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type="tel"
                            required
                            placeholder="10-digit number"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type="email"
                            required
                            placeholder="name@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            placeholder="Min 6 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-10 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Terms & Conditions scroll area */}
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-slate-300">Terms & Conditions & Privacy Policy</label>
                        <div className="w-full h-24 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-[10px] text-slate-400 font-sans leading-relaxed scrollbar-thin scrollbar-thumb-slate-800">
                          <p className="font-bold text-slate-200 mb-1">PARKOSPACE USER AGREEMENT</p>
                          <p className="mb-2">Please read these Terms and Conditions carefully before registering. By checking the box below, you agree to comply with and be bound by the following terms:</p>
                          <p className="font-bold text-slate-300 mb-0.5">1. Exclusion of Liability</p>
                          <p className="mb-2">ParkoSpace acts solely as a listing and discovery platform. We are NOT responsible or liable for any disputes, damage, loss of property, theft, personal injury, or issues of any kind arising between parking space owners and parkers.</p>
                          <p className="font-bold text-slate-300 mb-0.5">2. Verification Disclaimer</p>
                          <p className="mb-2">Parkers are strictly advised and required to verify details (such as spot availability, dimensions, security, access hours, and final pricing) directly with the owners before traveling to the parking location.</p>
                          <p className="font-bold text-slate-300 mb-0.5">3. Complaints & Support</p>
                          <p className="mb-2">For any complaints, dispute logging, feedback, or technical bug reports, please email us directly at <span className="text-teal-400 font-semibold font-mono">services@parkospace.xyz</span>. We will assist in resolving issues where possible, without accepting liability.</p>
                          <p className="font-bold text-slate-300 mb-0.5">4. Privacy Policy</p>
                          <p className="">We collect and store your name, email, phone number, and listing details solely to facilitate the booking connection. Your credentials are encrypted and will never be shared with unauthorized third parties.</p>
                        </div>
                      </div>

                      {/* Acceptance Checkbox */}
                      <div className="flex items-start gap-2.5 mt-2">
                        <input
                          id="terms-checkbox"
                          type="checkbox"
                          required
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="mt-0.5 rounded border-slate-800 bg-slate-950 text-teal-600 focus:ring-teal-500/30 cursor-pointer h-4 w-4"
                        />
                        <label htmlFor="terms-checkbox" className="text-[11px] text-slate-400 leading-normal cursor-pointer select-none">
                          I agree to the Terms & Conditions and Privacy Policy (including services@parkospace.xyz support contact).
                        </label>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm py-3 px-4 rounded-xl shadow-lg shadow-teal-900/20 hover:shadow-teal-900/30 transition flex items-center justify-center gap-2 cursor-pointer mt-6"
                      >
                        {loading && <Loader className="w-4 h-4 animate-spin" />}
                        {loading ? 'Sending Code...' : 'Create Account'}
                      </button>
                    </form>
                  )}
                </>
              )}

              {step === 2 && (
                // OTP VERIFICATION STEP
                <form onSubmit={handleRegisterVerify} className="space-y-6">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      Enter the 6-digit verification code sent to <strong className="text-slate-200">{email}</strong>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-center text-xs font-semibold text-slate-300 tracking-wider font-mono mb-2 uppercase">Verification Code</label>
                    <input
                      type="text"
                      required
                      maxLength="6"
                      placeholder="000000"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3.5 text-center text-xl font-bold font-mono tracking-[0.4em] text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex-1 border border-slate-800 hover:border-slate-700 text-slate-300 font-medium text-sm py-3 px-4 rounded-xl transition cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-[2] bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {loading && <Loader className="w-4 h-4 animate-spin" />}
                      Verify & Register
                    </button>
                  </div>
                </form>
              )}
            </>
          ) : (
            // FORGOT PASSWORD FLOW
            <>
              {step === 1 && (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div className="text-center mb-2">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Enter your registered email address and we'll send you an OTP to reset your password.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="email"
                        required
                        placeholder="name@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setIsForgot(false)}
                      className="flex-1 border border-slate-800 hover:border-slate-700 text-slate-300 font-medium text-sm py-3 px-4 rounded-xl transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-[2] bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {loading && <Loader className="w-4 h-4 animate-spin" />}
                      Send Reset OTP
                    </button>
                  </div>
                </form>
              )}

              {step === 2 && (
                // VERIFY & RESET PASSWORD STEP
                <form onSubmit={handleResetVerify} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 tracking-wider font-mono mb-2 uppercase text-center">Verification Code</label>
                    <input
                      type="text"
                      required
                      maxLength="6"
                      placeholder="000000"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 text-center text-lg font-bold font-mono tracking-[0.4em] text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="Min 6 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-10 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex-1 border border-slate-800 hover:border-slate-700 text-slate-300 font-medium text-sm py-3 px-4 rounded-xl transition cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-[2] bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {loading && <Loader className="w-4 h-4 animate-spin" />}
                      Reset Password
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

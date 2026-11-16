import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { resetPasswordApi } from '../services/api';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  KeyRound,
  ArrowLeft,
  Mail,
  ShieldCheck,
} from 'lucide-react';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlToken = searchParams.get('token') || '';
  const urlEmail = searchParams.get('email') || '';

  const [email, setEmail] = useState(urlEmail);
  const [tokenOrOtp, setTokenOrOtp] = useState(urlToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const isLinkFlow = Boolean(urlToken && urlToken.length > 10);

  useEffect(() => {
    if (urlEmail) setEmail(urlEmail);
    if (urlToken) setTokenOrOtp(urlToken);
  }, [urlEmail, urlToken]);

  // Password rules validation
  const rules = [
    { label: 'At least 8 characters long', valid: newPassword.length >= 8 },
    { label: 'At least one uppercase letter (A-Z)', valid: /[A-Z]/.test(newPassword) },
    { label: 'At least one lowercase letter (a-z)', valid: /[a-z]/.test(newPassword) },
    { label: 'At least one number (0-9)', valid: /[0-9]/.test(newPassword) },
    { label: 'At least one special symbol (!@#$%...)', valid: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword) },
    { label: 'Passwords match', valid: newPassword.length > 0 && newPassword === confirmPassword },
  ];

  const allValid = rules.every((r) => r.valid) && Boolean(email.trim()) && Boolean(tokenOrOtp.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allValid) {
      setError('Please check the email, verification code, and ensure password requirements are met.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await resetPasswordApi(email, tokenOrOtp, newPassword);
      setIsSuccess(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password. The link or code may have expired.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 p-8 text-white text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/10 rounded-2xl mb-3 backdrop-blur-md">
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Reset Your Password</h1>
          <p className="text-sm text-blue-100 mt-1">
            {isLinkFlow
              ? 'Reset token verified. Create your new password below.'
              : 'Enter your email, 6-digit verification code, and new password.'}
          </p>
        </div>

        {/* Content */}
        <div className="p-8">
          {isSuccess ? (
            <div className="text-center py-6 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full text-emerald-600 mb-2">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Password Reset Successful!</h2>
              <p className="text-sm text-slate-600">
                Your password has been securely updated. You can now sign in with your new credentials.
              </p>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors shadow-sm"
              >
                Proceed to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Email Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Registered Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Strategy A (Link Token) vs Strategy B (6-Digit OTP) */}
              {isLinkFlow ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-xs text-blue-800">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Authenticated via one-click secure reset link</span>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    6-Digit Verification Code (OTP)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={tokenOrOtp}
                    onChange={(e) => setTokenOrOtp(e.target.value.replace(/\s+/g, ''))}
                    placeholder="e.g. 839102"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 font-mono tracking-widest text-center placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-lg font-bold"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Enter the 6-digit code sent to your email inbox.
                  </p>
                </div>
              )}

              {/* New Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new strong password"
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Password Requirements Checklist */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs text-slate-600">
                <p className="font-semibold text-slate-700 mb-1">Password Requirements:</p>
                {rules.map((rule, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {rule.valid ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" />
                    )}
                    <span className={rule.valid ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                      {rule.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting || !allValid}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-lg text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                {isSubmitting ? 'Resetting Password...' : 'Set New Password'}
              </button>

              <div className="pt-2 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 font-medium transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

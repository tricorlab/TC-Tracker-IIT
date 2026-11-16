import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  CalendarCheck,
  ShieldAlert,
  Lock,
  Shield,
  Calendar,
  TrendingUp,
  Clock,
  Mail,
  Eye,
  EyeOff,
  KeyRound,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { requestForgotPasswordApi } from '../services/api';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}

// Official Google G Logo
const GoogleIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

// Current year constant for pure render
const CURRENT_YEAR = new Date().getFullYear();

export const LoginPage: React.FC = () => {
  const { user, loginWithGoogle, loginWithPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Email + Password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);

  // Forgot password modal state
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const rawFrom = (location.state as any)?.from?.pathname;

  // Resolve safe destination based on user's authorized role
  const getSafeDestination = (targetPath?: string, userRole?: string): string => {
    if (
      !targetPath ||
      targetPath === '/unauthorized' ||
      targetPath === '/login' ||
      targetPath === '/'
    ) {
      return '/dashboard';
    }

    // Admin-only paths
    const adminOnlyPrefixes = [
      '/admin',
      '/manager',
      '/attendance/marking',
      '/leave/requests',
      '/reports',
    ];

    const isAdminRoute = adminOnlyPrefixes.some(
      (prefix) => targetPath === prefix || targetPath.startsWith(`${prefix}/`)
    );

    // If target is an Admin-only path and user is not an Admin, redirect safely to dashboard
    if (isAdminRoute && userRole !== 'Admin') {
      return '/dashboard';
    }

    return targetPath;
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      const destination = getSafeDestination(rawFrom, user.role);
      navigate(destination, { replace: true });
    }
  }, [user, navigate, rawFrom]);

  // Load and initialize Google Identity Services
  useEffect(() => {
    if (!googleClientId) return;

    const scriptId = 'google-gsi-client';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    const handleCredentialResponse = async (response: any) => {
      if (!response.credential) return;
      setIsSubmitting(true);
      setLoginError(null);
      try {
        const authUser = await loginWithGoogle(response.credential);
        const destination = getSafeDestination(rawFrom, authUser.role);
        navigate(destination, { replace: true });
      } catch (err: any) {
        setLoginError(err?.message || 'Authentication failed. Please verify your account access.');
      } finally {
        setIsSubmitting(false);
      }
    };

    const initializeGsi = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleCredentialResponse,
        });

        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 320,
        });
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initializeGsi;
      document.body.appendChild(script);
    } else if (window.google?.accounts?.id) {
      initializeGsi();
    } else {
      script.addEventListener('load', initializeGsi);
    }

    return () => {
      script?.removeEventListener('load', initializeGsi);
    };
  }, [googleClientId, loginWithGoogle, navigate, rawFrom]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setIsPasswordSubmitting(true);
    setLoginError(null);
    try {
      const authUser = await loginWithPassword(email.trim(), password);
      const destination = getSafeDestination(rawFrom, authUser.role);
      navigate(destination, { replace: true });
    } catch (err: any) {
      setLoginError(err?.message || 'Invalid email or password.');
    } finally {
      setIsPasswordSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setForgotSubmitting(true);
    setForgotError(null);
    try {
      await requestForgotPasswordApi(forgotEmail.trim());
      setForgotSuccess(true);
    } catch (err: any) {
      setForgotError(err?.message || 'Unable to submit password reset request.');
    } finally {
      setForgotSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-slate-900 selection:bg-blue-600 selection:text-white">
      {/* Left Column: Visual Brand & Feature Showcase (Desktop / Laptop) */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between p-12 xl:p-16 bg-[#0e1d34] border-r border-[#1b2d4b] text-white overflow-hidden">
        {/* Ambient Gradient Glows */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top: Brand Identity */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight text-white block">
                TC Tracker
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Attendance &amp; Leave Management
              </span>
            </div>
          </div>
        </div>

        {/* Middle: Value Proposition & Feature Showcase */}
        <div className="relative z-10 my-auto py-10 space-y-8 max-w-lg">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 text-blue-300 text-xs font-semibold border border-blue-400/20">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>Institutional Portal</span>
            </span>
            <h1 className="text-3xl xl:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Smart attendance and leave management
            </h1>
            <p className="text-sm xl:text-base text-slate-300 leading-relaxed font-normal">
              Automated daily attendance recording, policy-compliant leave accruals, and centralized administrative reporting.
            </p>
          </div>

          {/* Feature Highlights Grid */}
          <div className="space-y-3.5">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs flex items-start gap-3.5 hover:bg-white/10 transition">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-400/20">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Daily Attendance Engine</h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Instant marking, weekend and holiday recognition, and automated attendance rate health.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs flex items-start gap-3.5 hover:bg-white/10 transition">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-400/20">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Automated Leave Accruals</h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Accrues 2.5 days/month with carryover rules, remaining balance donut charts, and excess warnings.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs flex items-start gap-3.5 hover:bg-white/10 transition">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-400/20">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Executive Audit &amp; Reports</h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Visual progress meters, employee rosters, activity trails, and one-click CSV report exports.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Trust & Security Pill */}
        <div className="relative z-10 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>256-Bit Encrypted Session</span>
          </div>
          <span className="font-mono text-[11px]">v1.0.0</span>
        </div>
      </div>

      {/* Right Column: Clean Authentication Panel */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-12 lg:p-16 bg-slate-50 min-h-screen">
        {/* Top Mobile Brand Bar */}
        <div className="flex items-center justify-between lg:hidden pb-6 border-b border-slate-200/60 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <CalendarCheck className="w-4.5 h-4.5" />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 text-base block leading-none">TC Tracker</span>
              <span className="text-[11px] text-slate-500 font-medium">Smart attendance and leave management</span>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
            Sign In
          </span>
        </div>

        {/* Center Card */}
        <div className="my-auto w-full max-w-md mx-auto">
          <div className="bg-white rounded-3xl p-8 sm:p-10 border border-slate-200/80 shadow-xl space-y-6 animate-fade-in">
            {/* Header */}
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100/80 flex items-center justify-center text-blue-600 shadow-xs mb-3">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Smart attendance and leave management
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Sign in with your institutional credentials or continue with Google Workspace.
              </p>
            </div>

            {/* Error Feedback */}
            {loginError && (
              <div className="bg-rose-50 border border-rose-200/90 rounded-2xl p-4 flex items-start gap-3 text-xs sm:text-sm text-rose-800 animate-fade-in">
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-rose-950">Access Denied</p>
                  <p className="text-rose-700 text-xs mt-0.5">{loginError}</p>
                </div>
              </div>
            )}

            {/* Email & Password Authentication Form */}
            <form onSubmit={handlePasswordLogin} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setForgotError(null);
                      setForgotSuccess(false);
                      setIsForgotModalOpen(true);
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPasswordSubmitting}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl text-sm transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {isPasswordSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <span>Sign In with Password</span>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-slate-400 font-semibold tracking-wider">
                  Or continue with
                </span>
              </div>
            </div>

            {/* Google Authentication Container */}
            <div className="space-y-4">
              {googleClientId ? (
                <div className="flex flex-col items-center justify-center min-h-[50px]">
                  {isSubmitting ? (
                    <div className="flex items-center gap-2.5 text-sm text-blue-600 font-semibold py-3">
                      <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Authenticating with Google...</span>
                    </div>
                  ) : (
                    <div ref={googleBtnRef} className="w-full flex justify-center" />
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
                    <GoogleIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800">
                      Google OAuth Not Yet Linked
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Set <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">VITE_GOOGLE_CLIENT_ID</code> in <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">frontend/.env</code> to render the live Google Sign-In widget.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Direct token entry removed for clean professional presentation */}
            {import.meta.env.DEV && window.location.hash === '#dev-token' && <div data-testid="dev-token-section" />}

            {/* Security Footer Note */}
            <div className="pt-2 text-center text-[11px] text-slate-400">
              <span>Protected by Google Workspace OAuth 2.0 Security</span>
            </div>
          </div>
        </div>

        {/* Bottom Footer Credits */}
        <div className="text-center text-xs text-slate-400 pt-6">
          <p>© {CURRENT_YEAR} TC Tracker. Smart attendance and leave management. All rights reserved.</p>
        </div>
      </div>

      {/* Forgot Password Modal (Supports Both Link & 6-Digit OTP) */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-700 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Reset Password</h3>
                  <p className="text-xs text-blue-100">Send reset link &amp; verification code</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {forgotSuccess ? (
                <div className="text-center py-4 space-y-4">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-base">Check Your Email</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      If an account is associated with <strong>{forgotEmail}</strong>, we've sent you both a <strong>One-Click Reset Link</strong> and a <strong>6-Digit Verification Code (OTP)</strong>.
                    </p>
                  </div>
                  <div className="pt-2 space-y-2">
                    <Link
                      to={`/reset-password?email=${encodeURIComponent(forgotEmail)}`}
                      className="block w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs text-center transition"
                    >
                      Enter 6-Digit Code / Reset Password
                    </Link>
                    <button
                      type="button"
                      onClick={() => setIsForgotModalOpen(false)}
                      className="block w-full py-2 px-4 text-xs text-slate-500 hover:text-slate-700 text-center"
                    >
                      Close Window
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  {forgotError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2">
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>{forgotError}</span>
                    </div>
                  )}

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Enter your registered email address below. We'll send you a time-limited <strong>1-click reset link</strong> along with a <strong>6-digit verification code</strong>.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsForgotModalOpen(false)}
                      className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold rounded-xl transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={forgotSubmitting || !forgotEmail.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                    >
                      {forgotSubmitting ? 'Sending...' : 'Send Reset Instructions'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;

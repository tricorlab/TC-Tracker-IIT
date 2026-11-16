import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../common/useToast';
import { Lock, Eye, EyeOff, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';

export const ForceChangePasswordModal: React.FC = () => {
  const { user, changePassword, logout } = useAuth();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If user is not logged in or doesn't have mustChangePassword flag, do not render
  if (!user || !user.mustChangePassword) {
    return null;
  }

  // Password rules validation
  const rules = [
    { label: 'At least 8 characters long', valid: newPassword.length >= 8 },
    { label: 'At least one uppercase letter (A-Z)', valid: /[A-Z]/.test(newPassword) },
    { label: 'At least one lowercase letter (a-z)', valid: /[a-z]/.test(newPassword) },
    { label: 'At least one number (0-9)', valid: /[0-9]/.test(newPassword) },
    { label: 'At least one special symbol (!@#$%...)', valid: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword) },
    { label: 'Passwords match', valid: newPassword.length > 0 && newPassword === confirmPassword },
  ];

  const allValid = rules.every((r) => r.valid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allValid) {
      setError('Please ensure your new password satisfies all security requirements.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await changePassword(currentPassword, newPassword);
      toast.success('Password updated successfully! Welcome to TC Tracker.', 'Password Set');
    } catch (err: any) {
      setError(err?.message || 'Failed to update password. Please check your current password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-6 text-white text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/20 rounded-full mb-3 backdrop-blur-md">
            <ShieldAlert className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold">Action Required: Set New Password</h2>
          <p className="text-sm text-amber-100 mt-1">
            You signed in with a temporary password. Please establish your private password to access your account.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg flex items-start gap-2">
              <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Current / Temporary Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Current (Temporary) Password
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter temporary password from email"
                className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              New Password
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Create a strong password"
                className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Confirm New Password
            </label>
            <input
              type={showNew ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>

          {/* Realtime Complexity Criteria */}
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

          {/* Submit Button */}
          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={isSubmitting || !allValid}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-lg text-sm transition-colors shadow-sm"
            >
              <Lock className="w-4 h-4" />
              {isSubmitting ? 'Updating Password...' : 'Save Password & Continue'}
            </button>

            <button
              type="button"
              onClick={() => logout()}
              className="w-full text-center text-xs text-slate-500 hover:text-slate-700 py-1"
            >
              Sign out and change later
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

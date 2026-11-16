import React, { useState, useEffect } from 'react';
import { fetchLeavePolicy, updateLeavePolicy } from '../services/api';
import {
  Settings,
  Save,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';

export const LeavePolicyPage: React.FC = () => {
  const [accrualRate, setAccrualRate] = useState<string>('2.5');
  const [carryForwardPercent, setCarryForwardPercent] = useState<string>('50');
  const [expiryDate, setExpiryDate] = useState<string>('03-31');
  const [remarks, setRemarks] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPolicy = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchLeavePolicy();
      setAccrualRate(String(res.policy.AccrualRatePerMonth));
      setCarryForwardPercent(String(res.policy.MaxCarryForwardPercent));
      setExpiryDate(res.policy.CarryForwardExpiryDate || '03-31');
      setRemarks(res.policy.Remarks || '');
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to load policy' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPolicy();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      await updateLeavePolicy({
        accrualRatePerMonth: parseFloat(accrualRate),
        maxCarryForwardPercent: parseFloat(carryForwardPercent),
        carryForwardExpiryDate: expiryDate.trim(),
        remarks: remarks.trim() || undefined,
      });

      setFeedback({ type: 'success', text: 'Leave policy updated successfully and recorded in audit log.' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to update leave policy' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-2.5">
          <Settings className="w-7 h-7 text-amber-600" />
          <span>Leave Policy Parameters</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure leave accrual rates and carry-forward parameters.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Explanatory Policy Card */}
      <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900 text-sm flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-950">Standard Institute Baseline</p>
          <p className="text-xs text-amber-800 leading-relaxed">
            Employees accrue leave at 2.5 days per completed calendar month from their joining date. On December 31, 50% of unused balance carries forward into the subsequent calendar year, expiring after March 31.
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Accrual Rate */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Accrual Rate Per Completed Month (Days) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0"
                max="30"
                value={accrualRate}
                onChange={(e) => setAccrualRate(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <span className="text-[11px] text-slate-400">Default: 2.5 days per month</span>
          </div>

          {/* Max Carry Forward Percent */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Carry-Forward Percentage (%) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={carryForwardPercent}
                onChange={(e) => setCarryForwardPercent(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <span className="text-[11px] text-slate-400">Default: 50% of unused balance</span>
          </div>

          {/* Expiry Date */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Carry-Forward Expiry Date (MM-DD) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              pattern="^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$"
              placeholder="03-31"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <span className="text-[11px] text-slate-400">Format: MM-DD (Default: 03-31 for March 31)</span>
          </div>

          {/* Remarks */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Policy Remarks
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Standard TC Tracker 2026 Academic Policy"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
          <button
            type="submit"
            disabled={saving || loading}
            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-amber-500/20 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Updating Policy...' : 'Save Policy Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

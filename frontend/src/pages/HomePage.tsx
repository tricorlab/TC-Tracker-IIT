import React, { useEffect, useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Activity, 
  Server, 
  FileSpreadsheet, 
  Shield, 
  Cloud, 
  Layers, 
  RefreshCw 
} from 'lucide-react';
import { fetchHealth, type HealthResponse } from '../services/api';

export const HomePage: React.FC = () => {
  const [healthStatus, setHealthStatus] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const checkApiHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHealth();
      setHealthStatus(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to reach API server');
      setHealthStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkApiHealth();
  }, []);

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold uppercase tracking-wider">
              Phase 1 Milestone
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              TC Tracker Application Shell
            </h1>
            <p className="text-slate-600 max-w-2xl text-sm sm:text-base">
              A private employee attendance and leave management system built with React, Express, 
              and Google Sheets API database.
            </p>
          </div>

          {/* Live API Health Monitor Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 min-w-[280px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-600" />
                Backend API Health
              </span>
              <button
                type="button"
                onClick={checkApiHealth}
                disabled={loading}
                title="Refresh Status"
                className="p-1 text-slate-400 hover:text-slate-700 transition rounded"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                <span>Connecting to API...</span>
              </div>
            ) : healthStatus?.success ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>API Operational</span>
                </div>
                <p className="text-xs text-slate-500 pl-6">
                  {healthStatus.message}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>API Offline</span>
                </div>
                <p className="text-xs text-rose-600 pl-6">
                  {error || 'Cannot connect to backend service'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tech Stack Grid */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          Approved Architecture Overview
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Frontend */}
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-900 text-base mb-1">Frontend</h3>
              <p className="text-xs text-slate-500 mb-3">Single Page Application</p>
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                <li>React 19 + TypeScript</li>
                <li>Vite Build Tooling</li>
                <li>Tailwind CSS Utility Styling</li>
                <li>React Router & Lucide React</li>
              </ul>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Shell Configured</span>
            </div>
          </div>

          {/* Backend */}
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                <Server className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-900 text-base mb-1">Backend</h3>
              <p className="text-xs text-slate-500 mb-3">REST API Engine</p>
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                <li>Node.js + Express.js + TypeScript</li>
                <li>CORS & Centralized Error Handling</li>
                <li>Typed Environment Configuration</li>
                <li>Modular REST Service Structure</li>
              </ul>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Health Endpoint Verified</span>
            </div>
          </div>

          {/* Database */}
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-900 text-base mb-1">Database</h3>
              <p className="text-xs text-slate-500 mb-3">Primary Data Store</p>
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                <li>Google Sheets via Google Sheets API v4</li>
                <li>Google Service Account Authentication</li>
                <li>Backend-only Secure Data Access</li>
                <li>No Firebase, PostgreSQL, or Prisma</li>
              </ul>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Service Layer Prepared</span>
            </div>
          </div>

          {/* Authentication */}
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-900 text-base mb-1">Authentication</h3>
              <p className="text-xs text-slate-500 mb-3">Identity & Roles</p>
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                <li>Google OAuth 2.0 Sign-In</li>
                <li>Backend Token Verification Middleware</li>
                <li>Role Authorization Structure</li>
                <li>Users Sheet Planned Role Lookup</li>
              </ul>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Middleware Prepared</span>
            </div>
          </div>

          {/* Deployment */}
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-9 h-9 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center mb-3">
                <Cloud className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-900 text-base mb-1">Deployment</h3>
              <p className="text-xs text-slate-500 mb-3">Hosting Platforms</p>
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                <li>Frontend: Vercel (Static / SPA)</li>
                <li>Backend: Render (Web Service)</li>
                <li>Separate Environment Configs</li>
                <li>Secure Secrets Isolation</li>
              </ul>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Configured for Staging/Prod</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

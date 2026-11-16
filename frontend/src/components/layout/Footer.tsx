import React from 'react';

const CURRENT_YEAR = new Date().getFullYear();

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto py-5 text-center text-xs text-slate-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p className="text-slate-600 font-medium">&copy; {CURRENT_YEAR} TC Tracker</p>
        <p className="text-slate-400 text-[11px]">Lab Attendance &amp; Leave System</p>
      </div>
    </footer>
  );
};

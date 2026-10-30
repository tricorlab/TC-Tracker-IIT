import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto py-6 text-center text-xs text-slate-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p>&copy; {new Date().getFullYear()} TC Tracker. Private attendance and leave management system.</p>
        <p className="text-slate-400">Powered by React, Express & Google Sheets API</p>
      </div>
    </footer>
  );
};

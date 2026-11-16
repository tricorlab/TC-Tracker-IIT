import React from 'react';

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] animate-pulse space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="h-2.5 bg-slate-100 rounded w-1/3"></div>
            <div className="w-7 h-7 bg-slate-100 rounded-lg"></div>
          </div>
          <div className="h-7 bg-slate-200/80 rounded w-1/2"></div>
          <div className="h-2 bg-slate-100 rounded w-3/4"></div>
        </div>
      ))}
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 4,
}) => {
  return (
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden animate-pulse">
      <div className="p-3.5 sm:p-4 border-b border-slate-100 flex gap-4">
        <div className="h-3.5 bg-slate-200/80 rounded w-1/4"></div>
        <div className="h-3.5 bg-slate-100 rounded w-1/4 ml-auto"></div>
      </div>
      <div className="divide-y divide-slate-100/70">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="p-3.5 sm:p-4 flex gap-4">
            {Array.from({ length: columns }).map((_, cIdx) => (
              <div key={cIdx} className="h-3 bg-slate-100 rounded flex-1"></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

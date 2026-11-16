import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  badge?: {
    text: string;
    variant?: 'emerald' | 'amber' | 'rose' | 'blue' | 'slate';
  };
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-slate-600',
  iconBg = 'bg-slate-50',
  badge,
  onClick,
  className = '',
}) => {
  const badgeStyles = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
    amber: 'bg-amber-50 text-amber-700 border-amber-200/70',
    rose: 'bg-rose-50 text-rose-700 border-rose-200/70',
    blue: 'bg-blue-50 text-blue-700 border-blue-200/70',
    slate: 'bg-slate-100 text-slate-700 border-slate-200/70',
  };

  return (
    <div
      onClick={onClick}
      className={`group relative bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 hover:border-slate-300 hover:shadow-xs flex flex-col justify-between ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400 group-hover:text-slate-500 transition-colors truncate">
            {title}
          </span>
          {Icon && (
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border border-slate-100 ${iconBg} ${iconColor} transition-transform group-hover:scale-105`}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl sm:text-[26px] font-bold tracking-tight text-slate-900 tabular-nums leading-tight">
            {value}
          </span>
          {badge && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border tracking-tight ${
                badgeStyles[badge.variant || 'slate']
              }`}
            >
              {badge.text}
            </span>
          )}
        </div>
      </div>

      {subtitle && (
        <p className="text-[11px] text-slate-400 mt-2.5 truncate font-normal">
          {subtitle}
        </p>
      )}
    </div>
  );
};

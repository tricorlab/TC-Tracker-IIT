import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Shield,
  Check,
  Sparkles,
} from 'lucide-react';

export type StatusVariant =
  | 'present'
  | 'absent'
  | 'not-marked'
  | 'within-allowance'
  | 'exceeds-allowance'
  | 'active'
  | 'inactive'
  | 'admin'
  | 'manager'
  | 'staff'
  | 'recorded'
  | 'pending'
  | 'holiday'
  | 'withdrawn';

interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  size?: 'sm' | 'md';
  className?: string;
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant,
  size = 'md',
  className = '',
  showIcon = true,
}) => {
  // Auto-detect variant if not explicitly provided
  const resolvedVariant: StatusVariant =
    variant ||
    (() => {
      const s = status.toLowerCase();
      if (s.includes('present')) return 'present';
      if (s.includes('absent')) return 'absent';
      if (s.includes('not marked')) return 'not-marked';
      if (s.includes('exceed')) return 'exceeds-allowance';
      if (s.includes('within') || s.includes('normal')) return 'within-allowance';
      if (s === 'active') return 'active';
      if (s === 'inactive') return 'inactive';
      if (s === 'admin') return 'admin';
      if (s === 'manager') return 'manager';
      if (s === 'staff') return 'staff';
      if (s.includes('record')) return 'recorded';
      if (s.includes('withdraw') || s.includes('cancel')) return 'withdrawn';
      if (s.includes('holiday') || s.includes('sunday')) return 'holiday';
      return 'not-marked';
    })();

  const variantStyles: Record<
    StatusVariant,
    { bg: string; text: string; border: string; dot: string; icon: React.FC<{ className?: string }> }
  > = {
    present: {
      bg: 'bg-emerald-50/70',
      text: 'text-emerald-700',
      border: 'border-emerald-200/60',
      dot: 'bg-emerald-500',
      icon: CheckCircle2,
    },
    absent: {
      bg: 'bg-rose-50/70',
      text: 'text-rose-700',
      border: 'border-rose-200/60',
      dot: 'bg-rose-500',
      icon: XCircle,
    },
    'not-marked': {
      bg: 'bg-slate-100/80',
      text: 'text-slate-600',
      border: 'border-slate-200/70',
      dot: 'bg-slate-400',
      icon: Clock,
    },
    'within-allowance': {
      bg: 'bg-emerald-50/70',
      text: 'text-emerald-700',
      border: 'border-emerald-200/60',
      dot: 'bg-emerald-500',
      icon: Check,
    },
    'exceeds-allowance': {
      bg: 'bg-amber-50/80',
      text: 'text-amber-800',
      border: 'border-amber-200/70',
      dot: 'bg-amber-500',
      icon: AlertTriangle,
    },
    active: {
      bg: 'bg-emerald-50/70',
      text: 'text-emerald-700',
      border: 'border-emerald-200/60',
      dot: 'bg-emerald-500',
      icon: CheckCircle2,
    },
    inactive: {
      bg: 'bg-slate-100/80',
      text: 'text-slate-500',
      border: 'border-slate-200/70',
      dot: 'bg-slate-400',
      icon: XCircle,
    },
    admin: {
      bg: 'bg-slate-900',
      text: 'text-white',
      border: 'border-slate-900',
      dot: 'bg-emerald-400',
      icon: Shield,
    },
    manager: {
      bg: 'bg-slate-100',
      text: 'text-slate-800',
      border: 'border-slate-300/80',
      dot: 'bg-blue-500',
      icon: Shield,
    },
    staff: {
      bg: 'bg-slate-50',
      text: 'text-slate-600',
      border: 'border-slate-200/70',
      dot: 'bg-slate-400',
      icon: Shield,
    },
    recorded: {
      bg: 'bg-blue-50/70',
      text: 'text-blue-700',
      border: 'border-blue-200/60',
      dot: 'bg-blue-500',
      icon: Check,
    },
    pending: {
      bg: 'bg-amber-50/80',
      text: 'text-amber-800',
      border: 'border-amber-200/70',
      dot: 'bg-amber-500',
      icon: Clock,
    },
    holiday: {
      bg: 'bg-blue-50/70',
      text: 'text-blue-700',
      border: 'border-blue-200/60',
      dot: 'bg-blue-500',
      icon: Sparkles,
    },
    withdrawn: {
      bg: 'bg-rose-50/70',
      text: 'text-rose-700',
      border: 'border-rose-200/60',
      dot: 'bg-rose-500',
      icon: XCircle,
    },
  };

  const style = variantStyles[resolvedVariant] || variantStyles['not-marked'];
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-md border tracking-tight transition-colors ${style.bg} ${style.text} ${style.border} ${sizeClass} ${className}`}
    >
      {showIcon && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{status}</span>
    </span>
  );
};

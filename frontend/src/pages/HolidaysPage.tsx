import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
} from '../services/api';
import type { HolidayItem } from '../services/api';
import { useToast } from '../components/common/useToast';
import {
  PlusCircle,
  Trash2,
  Edit2,
  AlertCircle,
  CheckCircle2,
  X,
  CalendarDays,
  Search,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Calendar,
  Clock,
  Sun,
  PartyPopper,
  LayoutGrid,
  List,
  ShieldCheck,
} from 'lucide-react';

const CURRENT_DATE = new Date();
const CURRENT_YEAR = CURRENT_DATE.getFullYear();
const CURRENT_MONTH = CURRENT_DATE.getMonth();
const TODAY_STR = new Date().toLocaleDateString('en-CA');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const DAY_OF_WEEK_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// Base horizon: 6 years historical up to 10+ years future planning (e.g., 2020 through 2036+)
const MIN_BASE_YEAR = Math.min(2020, CURRENT_YEAR - 5);
const MAX_BASE_YEAR = Math.max(2036, CURRENT_YEAR + 10);
const YEAR_OPTIONS = Array.from(
  { length: MAX_BASE_YEAR - MIN_BASE_YEAR + 1 },
  (_, i) => MIN_BASE_YEAR + i
);

interface CalendarGridCell {
  dateStr: string;
  dayNumber: number;
  monthIndex: number;
  year: number;
  isCurrentMonth: boolean;
  isSunday: boolean;
  isToday: boolean;
  holidays: HolidayItem[];
}

export const HolidaysPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTab, setFilterTab] = useState<'all' | 'upcoming' | 'past'>('all');

  // Google Calendar View & Navigation State
  const [currentMonthIndex, setCurrentMonthIndex] = useState<number>(CURRENT_MONTH);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedHolidayPreview, setSelectedHolidayPreview] = useState<HolidayItem | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingHoliday, setEditingHoliday] = useState<HolidayItem | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formDate, setFormDate] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const canManage = user?.role === 'Admin';

  const loadHolidays = useCallback(async (year: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchHolidays(year);
      const list = res?.holidays || (res as any)?.data || (Array.isArray(res) ? res : []);
      setHolidays(list.sort((a, b) => a.HolidayDate.localeCompare(b.HolidayDate)));
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch holidays');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHolidays(selectedYear);
  }, [loadHolidays, selectedYear]);

  // Dynamically compute selectable years: base range + selectedYear + any stored holiday record years
  const dynamicYearOptions = useMemo(() => {
    const years = new Set<number>(YEAR_OPTIONS);
    years.add(selectedYear);
    holidays.forEach((h) => {
      const yr = parseInt(h.HolidayDate?.slice(0, 4), 10);
      if (!isNaN(yr)) years.add(yr);
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [selectedYear, holidays]);

  // Calendar Navigation Handlers
  const handlePrevMonth = () => {
    if (currentMonthIndex === 0) {
      setCurrentMonthIndex(11);
      setSelectedYear((y) => y - 1);
    } else {
      setCurrentMonthIndex((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonthIndex === 11) {
      setCurrentMonthIndex(0);
      setSelectedYear((y) => y + 1);
    } else {
      setCurrentMonthIndex((m) => m + 1);
    }
  };

  const handleGoToToday = () => {
    const now = new Date();
    setSelectedYear(now.getFullYear());
    setCurrentMonthIndex(now.getMonth());
  };

  const formatReadableDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  // Derived Metrics & Calculations
  const stats = useMemo(() => {
    const total = holidays.length;
    const upcoming = holidays.filter((h) => h.HolidayDate >= TODAY_STR);
    const past = holidays.filter((h) => h.HolidayDate < TODAY_STR);

    // Identify next upcoming holiday
    const nextHoliday = upcoming.length > 0 ? upcoming[0] : null;
    let daysUntilNext: number | null = null;
    let countdownText = 'No more holidays this year';

    if (nextHoliday) {
      const diffMs =
        new Date(nextHoliday.HolidayDate + 'T00:00:00').getTime() -
        new Date(TODAY_STR + 'T00:00:00').getTime();
      daysUntilNext = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (daysUntilNext === 0) {
        countdownText = 'Today!';
      } else if (daysUntilNext === 1) {
        countdownText = 'Tomorrow';
      } else {
        countdownText = `In ${daysUntilNext} days`;
      }
    }

    // Long weekend counter (Holidays on Friday or Monday)
    const longWeekends = holidays.filter((h) => {
      const day = new Date(h.HolidayDate + 'T00:00:00').getDay();
      return day === 1 || day === 5;
    }).length;

    return {
      total,
      upcomingCount: upcoming.length,
      pastCount: past.length,
      nextHoliday,
      countdownText,
      longWeekends,
    };
  }, [holidays]);

  // Filtered holidays based on search query and filterTab
  const displayedHolidays = useMemo(() => {
    let list = holidays;

    if (filterTab === 'upcoming') {
      list = list.filter((h) => h.HolidayDate >= TODAY_STR);
    } else if (filterTab === 'past') {
      list = list.filter((h) => h.HolidayDate < TODAY_STR);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (h) =>
          h.HolidayName.toLowerCase().includes(q) ||
          (h.Description && h.Description.toLowerCase().includes(q)) ||
          h.HolidayDate.includes(q)
      );
    }

    return list;
  }, [holidays, filterTab, searchQuery]);

  // Group displayed holidays by month
  const monthlyGroups = useMemo(() => {
    const groups: { monthIndex: number; monthName: string; holidays: HolidayItem[] }[] = [];
    for (let m = 0; m < 12; m++) {
      const monthPrefix = `${selectedYear}-${String(m + 1).padStart(2, '0')}`;
      const inMonth = displayedHolidays.filter((h) => h.HolidayDate.startsWith(monthPrefix));
      if (inMonth.length > 0) {
        groups.push({
          monthIndex: m + 1,
          monthName: MONTH_NAMES[m],
          holidays: inMonth.sort((a, b) => a.HolidayDate.localeCompare(b.HolidayDate)),
        });
      }
    }
    return groups;
  }, [displayedHolidays, selectedYear]);

  // Google Calendar Grid Generator (35 or 42 grid cells)
  const calendarCells = useMemo((): CalendarGridCell[] => {
    const cells: CalendarGridCell[] = [];
    const year = selectedYear;
    const monthIndex = currentMonthIndex;

    const daysInCurrentMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const firstDayOfWeek = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();

    const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
    const prevYear = monthIndex === 0 ? year - 1 : year;
    const daysInPrevMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();

    // 1. Previous month leading padding cells
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const dateStr = `${prevYear}-${String(prevMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(Date.UTC(prevYear, prevMonthIndex, day)).getUTCDay();
      cells.push({
        dateStr,
        dayNumber: day,
        monthIndex: prevMonthIndex,
        year: prevYear,
        isCurrentMonth: false,
        isSunday: dayOfWeek === 0,
        isToday: dateStr === TODAY_STR,
        holidays: holidays.filter((h) => {
          if (h.HolidayDate !== dateStr) return false;
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase().trim();
          return (
            h.HolidayName.toLowerCase().includes(q) ||
            (h.Description && h.Description.toLowerCase().includes(q))
          );
        }),
      });
    }

    // 2. Current month cells
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = (firstDayOfWeek + day - 1) % 7;
      cells.push({
        dateStr,
        dayNumber: day,
        monthIndex,
        year,
        isCurrentMonth: true,
        isSunday: dayOfWeek === 0,
        isToday: dateStr === TODAY_STR,
        holidays: holidays.filter((h) => {
          if (h.HolidayDate !== dateStr) return false;
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase().trim();
          return (
            h.HolidayName.toLowerCase().includes(q) ||
            (h.Description && h.Description.toLowerCase().includes(q))
          );
        }),
      });
    }

    // 3. Next month trailing padding cells (ensure full 5 or 6 rows)
    const targetTotal = cells.length <= 35 ? 35 : 42;
    const nextMonthIndex = monthIndex === 11 ? 0 : monthIndex + 1;
    const nextYear = monthIndex === 11 ? year + 1 : year;

    let nextDay = 1;
    while (cells.length < targetTotal) {
      const dateStr = `${nextYear}-${String(nextMonthIndex + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
      const dayOfWeek = new Date(Date.UTC(nextYear, nextMonthIndex, nextDay)).getUTCDay();
      cells.push({
        dateStr,
        dayNumber: nextDay,
        monthIndex: nextMonthIndex,
        year: nextYear,
        isCurrentMonth: false,
        isSunday: dayOfWeek === 0,
        isToday: dateStr === TODAY_STR,
        holidays: holidays.filter((h) => {
          if (h.HolidayDate !== dateStr) return false;
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase().trim();
          return (
            h.HolidayName.toLowerCase().includes(q) ||
            (h.Description && h.Description.toLowerCase().includes(q))
          );
        }),
      });
      nextDay++;
    }

    return cells;
  }, [selectedYear, currentMonthIndex, holidays, searchQuery]);

  const monthHolidayCount = useMemo(() => {
    const monthPrefix = `${selectedYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
    return holidays.filter((h) => h.HolidayDate.startsWith(monthPrefix)).length;
  }, [holidays, selectedYear, currentMonthIndex]);

  // Modal Handlers
  const openCreateModal = (presetDate?: string) => {
    setEditingHoliday(null);
    setFormName('');
    setFormDate(presetDate || '');
    setFormDesc('');
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (h: HolidayItem) => {
    setEditingHoliday(h);
    setFormName(h.HolidayName);
    setFormDate(h.HolidayDate);
    setFormDesc(h.Description || '');
    setModalError(null);
    setIsModalOpen(true);
  };

  // Live Sunday Detection in Modal Form
  const isFormDateSunday = useMemo(() => {
    if (!formDate || !/^\d{4}-\d{2}-\d{2}$/.test(formDate)) return false;
    const [y, m, d] = formDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    return dateObj.getUTCDay() === 0;
  }, [formDate]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formDate) {
      setModalError('Holiday name and valid date are required.');
      return;
    }

    if (isFormDateSunday) {
      setModalError('Selected date falls on a Sunday. Official institute holidays cannot be scheduled on weekly offs.');
      return;
    }

    setSubmitting(true);
    setModalError(null);

    const targetYear = parseInt(formDate.split('-')[0], 10);

    try {
      if (editingHoliday) {
        await updateHoliday(editingHoliday.HolidayID, {
          holidayName: formName.trim(),
          holidayDate: formDate,
          description: formDesc.trim() || undefined,
        });
        const msg = 'Holiday updated successfully.';
        setSuccess(msg);
        toast.success(msg, 'Holiday Saved');
      } else {
        await createHoliday({
          holidayName: formName.trim(),
          holidayDate: formDate,
          description: formDesc.trim() || undefined,
        });
        const msg = 'Holiday created successfully.';
        setSuccess(msg);
        toast.success(msg, 'Holiday Added');
      }
      setIsModalOpen(false);

      // Auto-switch selectedYear if added in a different year
      if (targetYear && targetYear !== selectedYear) {
        setSelectedYear(targetYear);
      } else {
        await loadHolidays(selectedYear);
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to save holiday';
      setModalError(msg);
      toast.error(msg, 'Save Error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the holiday "${name}"?`)) {
      return;
    }
    try {
      await deleteHoliday(id);
      const msg = `Holiday "${name}" deleted successfully.`;
      setSuccess(msg);
      toast.success(msg, 'Holiday Deleted');
      await loadHolidays(selectedYear);
    } catch (err: any) {
      const msg = err?.message || 'Failed to delete holiday';
      setError(msg);
      toast.error(msg, 'Delete Error');
    }
  };

  // CSV Export Handler
  const handleExportCsv = () => {
    if (holidays.length === 0) {
      toast.info('No holidays to export for this year.');
      return;
    }
    const headers = ['Date', 'Day of Week', 'Holiday Name', 'Long Weekend', 'Description'];
    const rows = holidays.map((h) => {
      const d = new Date(h.HolidayDate + 'T00:00:00');
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      const dayOfWeek = d.getDay();
      const isLongWeekend = dayOfWeek === 1 || dayOfWeek === 5 ? 'Yes (3-day weekend)' : 'No';
      return [h.HolidayDate, dayName, h.HolidayName, isLongWeekend, h.Description || ''];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `institute-holidays-${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${holidays.length} holidays for ${selectedYear}`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* 1. Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
        <div>
          <div className="text-xs text-slate-400 font-medium mb-1">
            Institute Calendar &gt; Holidays
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
            <CalendarDays className="w-7 h-7 text-blue-600 shrink-0" />
            <span>Official Institute Holidays</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Declared non-working days for staff. Sundays and registered holidays are exempt from absence tallies.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 no-print">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={holidays.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs transition disabled:opacity-50 cursor-pointer"
            title="Download Holiday Calendar as CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs transition cursor-pointer"
            title="Print Holiday Schedule"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Print</span>
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0e1d34] hover:bg-[#162744] text-white text-xs sm:text-sm font-semibold shadow-sm transition active:scale-95 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Holiday</span>
            </button>
          )}
        </div>
      </div>

      {/* Printable Header */}
      <div className="hidden print:block pb-4 border-b border-slate-300">
        <h2 className="text-2xl font-bold text-slate-900">TC Tracker — Official Holiday Schedule</h2>
        <div className="text-sm text-slate-600 mt-1">
          Calendar Year: {selectedYear} | Total Holidays: {holidays.length} | Generated on: {CURRENT_DATE.toLocaleDateString()}
        </div>
      </div>

      {/* 2. Executive Holiday KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 no-print">
        {/* Card 1: Total Holidays */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 block uppercase tracking-wider">
              Total Holidays
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {stats.total}
              </span>
              <span className="text-xs text-slate-400 font-medium">days in {selectedYear}</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Next Upcoming Holiday Banner */}
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50/60 rounded-2xl p-3.5 sm:p-5 border border-indigo-200/80 shadow-xs flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <span className="text-[11px] font-bold text-indigo-700 block uppercase tracking-wider">
              Next Upcoming Holiday
            </span>
            <div className="mt-1">
              {stats.nextHoliday ? (
                <>
                  <span className="text-sm font-extrabold text-slate-900 truncate block">
                    {stats.nextHoliday.HolidayName}
                  </span>
                  <span className="text-xs font-semibold text-indigo-700 block mt-0.5">
                    {stats.nextHoliday.HolidayDate} • {stats.countdownText}
                  </span>
                </>
              ) : (
                <span className="text-xs font-medium text-slate-500 block">
                  Completed for {selectedYear}
                </span>
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Long Weekends */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 block uppercase tracking-wider">
              Long Weekends
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-purple-700 tracking-tight">
                {stats.longWeekends}
              </span>
              <span className="text-xs text-slate-400 font-medium">Fri / Mon breaks</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
            <PartyPopper className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Remaining Holidays */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 block uppercase tracking-wider">
              Remaining This Year
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-700 tracking-tight">
                {stats.upcomingCount}
              </span>
              <span className="text-xs text-slate-400 font-medium">active upcoming</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Feedback Alerts */}
      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4. Controls & Navigation Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3.5 no-print">
        {/* Left: Google Calendar Month Navigation & Selectors */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Today Button */}
          <button
            type="button"
            onClick={handleGoToToday}
            className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95"
            title="Jump to current date"
          >
            Today
          </button>

          {/* Steppers */}
          <div className="flex items-center rounded-xl border border-slate-300 overflow-hidden shadow-2xs bg-white">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Month Dropdown */}
          <select
            value={currentMonthIndex}
            onChange={(e) => setCurrentMonthIndex(Number(e.target.value))}
            className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>

          {/* Year Selector (Steppers + Dynamic Dropdown up to 2036+) */}
          <div className="flex items-center rounded-xl border border-slate-300 overflow-hidden shadow-2xs bg-white">
            <button
              type="button"
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-1.5 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
              title="Previous Year"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-2.5 py-1.5 text-xs font-bold text-slate-800 bg-white focus:outline-none cursor-pointer"
              title="Select Calendar Year"
            >
              {dynamicYearOptions.map((y) => (
                <option key={y} value={y}>
                  {y === CURRENT_YEAR ? `${y} (Current)` : y}
                </option>
              ))}
            </select>
            <div className="h-4 w-px bg-slate-200" />
            <button
              type="button"
              onClick={() => setSelectedYear((y) => y + 1)}
              className="p-1.5 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
              title="Next Year"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Prominent Active Month/Year Header */}
          <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-200">
            <span className="text-sm font-extrabold text-slate-900 tracking-tight">
              {MONTH_NAMES[currentMonthIndex]} {selectedYear}
            </span>
            {monthHolidayCount > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {monthHolidayCount} Holiday{monthHolidayCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Right: Search Input & View Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative min-w-[190px] sm:min-w-[210px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search holidays..."
              className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Google Calendar vs Schedule List View Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Google Calendar Monthly Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-blue-600" />
              <span>Month</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Detailed Chronological Schedule List View"
            >
              <List className="w-3.5 h-3.5 text-slate-600" />
              <span>Schedule</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5. Main Calendar / Schedule Content */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-slate-200/70 rounded-2xl" />
          ))}
        </div>
      ) : viewMode === 'calendar' ? (
        /* ========================================================================= */
        /* GOOGLE CALENDAR MONTHLY GRID VIEW                                         */
        /* ========================================================================= */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          {/* Calendar Month Header Banner */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 via-white to-blue-50/40 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-base shadow-xs">
                {currentMonthIndex + 1}
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span>{MONTH_NAMES[currentMonthIndex]}</span>
                  <span className="text-blue-600 font-extrabold">{selectedYear}</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {monthHolidayCount > 0 ? (
                    <span className="text-blue-700 font-semibold">
                      {monthHolidayCount} official holiday{monthHolidayCount > 1 ? 's' : ''} in {MONTH_NAMES[currentMonthIndex]} {selectedYear}
                    </span>
                  ) : (
                    <span>No official holidays scheduled in this month</span>
                  )}
                </p>
              </div>
            </div>

            {/* Stepper controls */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>
              <button
                type="button"
                onClick={handleGoToToday}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer"
              >
                Current Month
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 7-Day Week Header Grid */}
          <div className="grid grid-cols-7 border-b border-slate-200 text-center font-bold text-[11px] sm:text-xs uppercase tracking-wider select-none">
            {DAY_OF_WEEK_NAMES.map((dayName, idx) => (
              <div
                key={dayName}
                className={`py-2.5 border-r border-slate-200/80 last:border-r-0 ${
                  idx === 0
                    ? 'bg-rose-50/50 text-rose-600 font-black'
                    : 'bg-slate-50/80 text-slate-600 font-bold'
                }`}
              >
                <span>{dayName}</span>
                {idx === 0 && (
                  <span className="hidden sm:inline text-[10px] text-rose-500 font-medium ml-1">
                    (Off)
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Google Calendar 7x5 or 7x6 Day Cells Grid */}
          <div className="grid grid-cols-7 divide-x divide-slate-200/80 bg-slate-100/60">
            {calendarCells.map((cell, idx) => {
              const isCurrentMonth = cell.isCurrentMonth;
              const isToday = cell.isToday;
              const isSunday = cell.isSunday;
              const cellHolidays = cell.holidays;

              return (
                <div
                  key={cell.dateStr + '-' + idx}
                  onClick={() => {
                    if (canManage && isCurrentMonth && !isSunday) {
                      openCreateModal(cell.dateStr);
                    }
                  }}
                  className={`border-b border-slate-200/80 p-1.5 sm:p-2 min-h-[110px] sm:min-h-[125px] flex flex-col justify-between transition-colors group relative ${
                    !isCurrentMonth
                      ? 'bg-slate-50/60 opacity-60 text-slate-400'
                      : isToday
                      ? 'bg-blue-50/40'
                      : isSunday
                      ? 'bg-amber-50/15'
                      : 'bg-white hover:bg-slate-50/60'
                  } ${canManage && isCurrentMonth && !isSunday ? 'cursor-pointer' : ''}`}
                >
                  {/* Top: Day Number and Badges */}
                  <div className="flex items-center justify-between gap-1">
                    {/* Day Number */}
                    {isToday ? (
                      <span
                        className="w-6 h-6 rounded-full bg-blue-600 text-white font-extrabold flex items-center justify-center text-xs shadow-xs"
                        title="Today"
                      >
                        {cell.dayNumber}
                      </span>
                    ) : isSunday ? (
                      <span className="text-xs font-bold text-rose-600 pl-0.5">
                        {cell.dayNumber}
                      </span>
                    ) : !isCurrentMonth ? (
                      <span className="text-xs font-medium text-slate-400 pl-0.5">
                        {cell.dayNumber}
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-slate-800 pl-0.5">
                        {cell.dayNumber}
                      </span>
                    )}

                    {/* Weekly Off Tag or Quick Schedule Button */}
                    {isSunday ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 uppercase tracking-tighter">
                        Off
                      </span>
                    ) : canManage && isCurrentMonth ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCreateModal(cell.dateStr);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1 rounded transition cursor-pointer"
                        title={`Schedule holiday on ${cell.dateStr}`}
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>

                  {/* Middle: Google Calendar Event Pills */}
                  <div className="space-y-1 my-1 overflow-y-auto max-h-[85px]">
                    {cellHolidays.map((h) => {
                      const d = new Date(h.HolidayDate + 'T00:00:00');
                      const dayNum = d.getDay();
                      const isLongWeekend = dayNum === 1 || dayNum === 5;

                      return (
                        <button
                          key={h.HolidayID}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedHolidayPreview(h);
                          }}
                          className={`w-full text-left px-2 py-1 rounded-md text-[11px] font-semibold truncate flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer hover:shadow-xs active:scale-[0.98] ${
                            isLongWeekend
                              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                          title={`${h.HolidayName}${
                            isLongWeekend ? ' (3-Day Long Weekend)' : ''
                          }`}
                        >
                          <Sparkles className="w-3 h-3 shrink-0 text-white/90" />
                          <span className="truncate flex-1">{h.HolidayName}</span>
                          {isLongWeekend && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-white/20 font-bold shrink-0">
                              3D
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Bottom: Sunday Indicator */}
                  {isSunday && cellHolidays.length === 0 && (
                    <div className="text-[10px] text-slate-400 italic pl-0.5 select-none">
                      Weekly Off
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Google Calendar Legend Footer */}
          <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3.5 text-slate-600">
              <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                Legend:
              </span>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-600 inline-block shadow-2xs" />
                <span className="font-semibold text-slate-700">Official Holiday</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-gradient-to-r from-purple-600 to-indigo-600 inline-block shadow-2xs" />
                <span className="font-semibold text-slate-700">3-Day Long Weekend</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300 inline-block shadow-2xs" />
                <span className="font-semibold text-slate-700">Weekly Off (Sunday)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">
                  •
                </span>
                <span className="font-semibold text-slate-700">Today</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 font-medium">
              {canManage ? (
                <span>Click any holiday pill for details, or click any weekday cell to schedule a holiday.</span>
              ) : (
                <span>Click any holiday pill to view details & policy guidelines.</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* DETAILED SCHEDULE LIST VIEW                                               */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* Segmented Filter Pills in Schedule Mode */}
          <div className="flex items-center justify-between flex-wrap gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Filter Holidays:
            </span>
            <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  filterTab === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({holidays.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('upcoming')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  filterTab === 'upcoming'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Upcoming ({stats.upcomingCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('past')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  filterTab === 'past'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Past ({stats.pastCount})
              </button>
            </div>
          </div>

          {monthlyGroups.length > 0 ? (
            monthlyGroups.map((group) => (
              <div
                key={group.monthIndex}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
              >
                {/* Month Group Header */}
                <div className="p-3.5 px-5 bg-slate-50/80 border-b border-slate-200/70 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <h3 className="font-bold text-slate-900 text-sm tracking-tight">
                      {group.monthName} {selectedYear}
                    </h3>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                    {group.holidays.length} Holiday{group.holidays.length > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Month Holidays Cards */}
                <div className="divide-y divide-slate-100">
                  {group.holidays.map((h) => {
                    const d = new Date(h.HolidayDate + 'T00:00:00');
                    const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' });
                    const dayNum = d.getDay();
                    const isLongWeekend = dayNum === 1 || dayNum === 5;
                    const isUpcoming = h.HolidayDate >= TODAY_STR;
                    const isToday = h.HolidayDate === TODAY_STR;

                    return (
                      <div
                        key={h.HolidayID}
                        onClick={() => setSelectedHolidayPreview(h)}
                        className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors cursor-pointer ${
                          isToday
                            ? 'bg-blue-50/40 hover:bg-blue-50/60'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        {/* Left: Graphical Date Tile + Name & Details */}
                        <div className="flex items-start sm:items-center gap-4 min-w-0">
                          {/* Graphical Date Tile */}
                          <div
                            className={`w-12 h-12 rounded-2xl border flex flex-col items-center justify-center shrink-0 shadow-2xs ${
                              isToday
                                ? 'bg-blue-600 text-white border-blue-700 ring-4 ring-blue-100'
                                : isUpcoming
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            <span className="text-[10px] font-extrabold uppercase leading-none tracking-wider">
                              {d.toLocaleDateString('en-US', { month: 'short' })}
                            </span>
                            <span className="text-base font-black leading-tight mt-0.5">
                              {d.getDate()}
                            </span>
                          </div>

                          {/* Title & Badges */}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight truncate">
                                {h.HolidayName}
                              </h4>

                              <span className="text-xs font-semibold text-slate-500 font-mono">
                                ({dayOfWeek})
                              </span>

                              {isLongWeekend && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                  <Sparkles className="w-3 h-3 text-purple-600" />
                                  <span>3-Day Long Weekend</span>
                                </span>
                              )}

                              {isToday ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                  Today!
                                </span>
                              ) : isUpcoming ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Upcoming
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                                  Passed
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-500 mt-1">
                              {h.Description || 'Official Institute Gazetted Holiday'}
                            </p>
                          </div>
                        </div>

                        {/* Right: Admin Action Buttons */}
                        {canManage && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-2 self-end sm:self-center shrink-0 no-print"
                          >
                            <button
                              type="button"
                              onClick={() => openEditModal(h)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer shadow-2xs"
                              title="Edit Holiday"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                              <span className="hidden sm:inline">Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(h.HolidayID, h.HolidayName)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold transition cursor-pointer shadow-2xs"
                              title="Delete Holiday"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              <span className="hidden sm:inline">Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-xs text-slate-500 space-y-3">
              <CalendarDays className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="font-bold text-slate-800 text-sm">
                {searchQuery
                  ? `No holidays matching "${searchQuery}"`
                  : `No holidays found for ${selectedYear}`}
              </h4>
              <p className="text-slate-400 max-w-md mx-auto">
                {searchQuery
                  ? 'Try searching with another keyword or clear the search filter.'
                  : `No official holidays have been scheduled for calendar year ${selectedYear} yet.`}
              </p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  Clear Search Filter
                </button>
              )}
              {canManage && !searchQuery && (
                <button
                  type="button"
                  onClick={() => openCreateModal()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Schedule First Holiday for {selectedYear}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 6. Smart Add / Edit Holiday Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 my-auto">
            {/* Modal Title */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingHoliday ? 'Edit Institute Holiday' : 'Add New Institute Holiday'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer transition"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Notification */}
            {modalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Live Sunday Warning */}
            {isFormDateSunday && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                <Sun className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Sunday Detected:</strong> The selected date is a Sunday. Institute policy forbids scheduling holidays on regular weekly off days.
                </span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Holiday Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Diwali, Independence Day, Republic Day"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Date (YYYY-MM-DD) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 shadow-2xs bg-white ${
                    isFormDateSunday
                      ? 'border-amber-400 focus:ring-amber-500 bg-amber-50/30'
                      : 'border-slate-300 focus:ring-blue-500'
                  }`}
                />
                <span className="text-[11px] text-slate-400 block mt-1">
                  Sundays are weekly offs and cannot be declared as institute holidays.
                </span>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Description / Remarks <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="e.g. National Gazetted Holiday or Festival break"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || isFormDateSunday}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition cursor-pointer"
                >
                  {submitting
                    ? 'Saving...'
                    : editingHoliday
                    ? 'Update Holiday'
                    : 'Schedule Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Google Calendar Holiday Event Detail Modal */}
      {selectedHolidayPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header Banner */}
            {(() => {
              const d = new Date(selectedHolidayPreview.HolidayDate + 'T00:00:00');
              const dayNum = d.getDay();
              const isLongWeekend = dayNum === 1 || dayNum === 5;
              const isUpcoming = selectedHolidayPreview.HolidayDate >= TODAY_STR;
              const isToday = selectedHolidayPreview.HolidayDate === TODAY_STR;

              return (
                <>
                  <div
                    className={`p-5 text-white flex items-center justify-between ${
                      isLongWeekend
                        ? 'bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-600'
                        : 'bg-gradient-to-r from-blue-700 to-indigo-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-white/80 block">
                          Official Institute Holiday
                        </span>
                        <h3 className="text-lg font-black tracking-tight text-white leading-tight">
                          {selectedHolidayPreview.HolidayName}
                        </h3>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedHolidayPreview(null)}
                      className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
                      aria-label="Close Preview"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Body Content */}
                  <div className="p-6 space-y-4 text-xs">
                    {/* Date & Time Row */}
                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                      <Calendar className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold text-slate-900 text-sm block">
                          {formatReadableDate(selectedHolidayPreview.HolidayDate)}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          {isToday ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                              Today!
                            </span>
                          ) : isUpcoming ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Upcoming Holiday
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-700">
                              Passed Holiday
                            </span>
                          )}
                          <span className="text-[11px] text-slate-500 font-mono">
                            {selectedHolidayPreview.HolidayDate}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Long Weekend Callout */}
                    {isLongWeekend && (
                      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900">
                        <PartyPopper className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block text-[11px] uppercase tracking-wider text-purple-700">
                            3-Day Long Weekend
                          </span>
                          <p className="text-xs text-purple-800 mt-0.5">
                            {dayNum === 5
                              ? 'Falls on Friday, pairing with Saturday and Sunday for an extended 3-day rest break.'
                              : 'Falls on Monday, pairing with Sunday for an extended 3-day weekend rest break.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Non-Working Day Immunity Guarantee */}
                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                      <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block text-[11px] uppercase tracking-wider text-emerald-800">
                          Absence Immunity Guarantee
                        </span>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          Official non-working day for all staff. Daily attendance is not marked, and zero penalties or leave deductions apply.
                        </p>
                      </div>
                    </div>

                    {/* Description / Remarks */}
                    <div className="space-y-1 pt-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Description / Remarks
                      </span>
                      <p className="text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                        {selectedHolidayPreview.Description || 'Official Gazetted Institute Holiday'}
                      </p>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <div>
                        {canManage && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const h = selectedHolidayPreview;
                                setSelectedHolidayPreview(null);
                                openEditModal(h);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const h = selectedHolidayPreview;
                                setSelectedHolidayPreview(null);
                                handleDelete(h.HolidayID, h.HolidayName);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedHolidayPreview(null)}
                        className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer shadow-xs"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default HolidaysPage;

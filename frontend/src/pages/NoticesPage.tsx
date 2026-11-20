import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/useToast';
import {
  fetchNotices,
  createNotice,
  updateNotice,
  deleteNotice,
  resendNoticeEmail,
} from '../services/api';
import type { NoticeItem, CreateNoticePayload } from '../services/api';
import {
  Megaphone,
  Plus,
  Search,
  Pin,
  Mail,
  AlertTriangle,
  Clock,
  User,
  Trash2,
  Send,
  Eye,
  X,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';

const CATEGORIES = [
  'All',
  'General',
  'Urgent',
  'Policy',
  'Holiday',
  'Event',
  'Maintenance',
] as const;

const QUICK_TEMPLATES = [
  {
    label: 'Holiday Schedule',
    title: 'Official Holiday Notice: Upcoming Institutional Closure',
    category: 'Holiday',
    priority: 'Normal' as const,
    content:
      'Dear Staff,\n\nPlease note that our institution will remain closed on [Holiday Date] in observance of [Holiday Name]. Normal operations will resume on the next working day.\n\nEnjoy the holiday!',
  },
  {
    label: 'Staff Meeting',
    title: 'General Staff Meeting & Operational Briefing',
    category: 'Event',
    priority: 'Normal' as const,
    content:
      'Dear Team,\n\nAll staff are invited to attend our upcoming general staff meeting scheduled for [Date & Time] in the Main Conference Hall / Virtual Meet.\n\nAgenda:\n1. Monthly operational highlights\n2. Upcoming deadlines & roster planning\n3. Open Q&A session\n\nPlease be on time.',
  },
  {
    label: 'Policy Reminder',
    title: 'Policy Update: Leave Accrual & Attendance Verification',
    category: 'Policy',
    priority: 'High' as const,
    content:
      'Dear Staff Members,\n\nThis is a gentle reminder regarding our monthly attendance self-verification and casual leave carry-forward rules:\n• Monthly accrual is credited at 2.5 days per completed calendar month.\n• Carried-forward leave balances must be utilized before their respective expiry date.\n\nPlease inspect your records on the TC Tracker dashboard.',
  },
  {
    label: 'System Maintenance',
    title: 'Scheduled System Maintenance & Downtime Window',
    category: 'Maintenance',
    priority: 'Urgent' as const,
    content:
      'Dear Staff,\n\nRoutine infrastructure maintenance will be performed on [Date] between [Start Time] and [End Time]. During this window, portal services may be momentarily unavailable.\n\nWe apologize for any inconvenience caused.',
  },
];

export const NoticesPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'Admin';

  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Active' | 'Archived' | 'All'>('Active');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [inspectNotice, setInspectNotice] = useState<NoticeItem | null>(null);
  const [previewTab, setPreviewTab] = useState<'form' | 'preview'>('form');

  // Create Form State
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('General');
  const [formPriority, setFormPriority] = useState<'Normal' | 'High' | 'Urgent'>('Normal');
  const [formTargetRole, setFormTargetRole] = useState<'All' | 'Staff' | 'Admin'>('All');
  const [formIsPinned, setFormIsPinned] = useState(false);
  const [formSendEmail, setFormSendEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Re-send / Action loading
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadNotices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchNotices({
        status: statusFilter,
        category: selectedCategory !== 'All' ? selectedCategory : undefined,
      });
      if (res.success && Array.isArray(res.data)) {
        setNotices(res.data);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load notices.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, selectedCategory, showToast]);

  useEffect(() => {
    loadNotices();
  }, [loadNotices]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadNotices();
  };

  // Filtered notices
  const filteredNotices = useMemo(() => {
    return notices.filter((n) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        n.Title.toLowerCase().includes(q) ||
        n.Content.toLowerCase().includes(q) ||
        n.Category.toLowerCase().includes(q) ||
        (n.CreatorName && n.CreatorName.toLowerCase().includes(q))
      );
    });
  }, [notices, searchQuery]);

  // Metrics
  const metrics = useMemo(() => {
    const total = notices.length;
    const active = notices.filter((n) => n.Status === 'Active').length;
    const urgent = notices.filter(
      (n) => n.Priority === 'Urgent' || n.Priority === 'High'
    ).length;
    const pinned = notices.filter(
      (n) => n.IsPinned === true || String(n.IsPinned).toUpperCase() === 'TRUE'
    ).length;
    const emailed = notices.filter(
      (n) => n.EmailStatus === 'Sent' || n.EmailStatus === 'Partial'
    ).length;
    return { total, active, urgent, pinned, emailed };
  }, [notices]);

  // Apply Quick Template
  const applyTemplate = (tpl: (typeof QUICK_TEMPLATES)[0]) => {
    setFormTitle(tpl.title);
    setFormCategory(tpl.category);
    setFormPriority(tpl.priority);
    setFormContent(tpl.content);
  };

  // Submit Notice
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast('Please provide a title for the notice.', 'error');
      return;
    }
    if (!formContent.trim()) {
      showToast('Please provide the notice content/message.', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const payload: CreateNoticePayload = {
        title: formTitle.trim(),
        content: formContent.trim(),
        category: formCategory,
        priority: formPriority,
        targetRole: formTargetRole,
        isPinned: formIsPinned,
        sendEmail: formSendEmail,
      };

      const res = await createNotice(payload);
      if (res.success) {
        showToast(res.message, 'success');
        setCreateModalOpen(false);
        // Reset form
        setFormTitle('');
        setFormContent('');
        setFormCategory('General');
        setFormPriority('Normal');
        setFormIsPinned(false);
        setFormSendEmail(true);
        loadNotices();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to publish notice.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle Pin
  const handleTogglePin = async (notice: NoticeItem) => {
    const currentPinned =
      notice.IsPinned === true || String(notice.IsPinned).toUpperCase() === 'TRUE';
    try {
      setActionLoadingId(notice.NoticeID);
      const res = await updateNotice(notice.NoticeID, {
        isPinned: !currentPinned,
      });
      if (res.success) {
        showToast(
          `Notice ${!currentPinned ? 'pinned to top' : 'unpinned'}.`,
          'success'
        );
        loadNotices();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update notice pin status.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Resend Email
  const handleResendEmail = async (notice: NoticeItem) => {
    if (
      !window.confirm(
        `Are you sure you want to broadcast this notice email to all active staff members again?`
      )
    ) {
      return;
    }

    try {
      setActionLoadingId(notice.NoticeID);
      const res = await resendNoticeEmail(notice.NoticeID);
      if (res.success) {
        showToast(res.message, 'success');
        loadNotices();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to broadcast email.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Delete Notice
  const handleDeleteNotice = async (notice: NoticeItem) => {
    if (
      !window.confirm(
        `Are you sure you want to delete notice "${notice.Title}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setActionLoadingId(notice.NoticeID);
      const res = await deleteNotice(notice.NoticeID);
      if (res.success) {
        showToast(res.message, 'success');
        if (inspectNotice?.NoticeID === notice.NoticeID) {
          setInspectNotice(null);
        }
        loadNotices();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete notice.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <PageHeader
        title="Official Staff Notices & Announcements"
        subtitle="Executive administrative circulars, holiday notices, and institutional directives."
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading || refreshing}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-medium transition cursor-pointer shadow-2xs hover:bg-slate-50 disabled:opacity-50"
              title="Refresh notices"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  refreshing ? 'animate-spin text-blue-600' : ''
                }`}
              />
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setPreviewTab('form');
                  setCreateModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0e1d34] hover:bg-[#162744] text-white text-xs sm:text-sm font-semibold transition active:scale-95 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Publish Notice</span>
              </button>
            )}
          </div>
        }
      />

      {/* Metrics Bar for Admin */}
      {isAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Total Notices
              </span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Megaphone className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">
              {metrics.total}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {metrics.active} active notices
            </span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Urgent / High
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-600 mt-2">
              {metrics.urgent}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              High priority directives
            </span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Pinned Notices
              </span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Pin className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">
              {metrics.pinned}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Sticky at top of feeds
            </span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Staff Email Broadcasts
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Mail className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-600 mt-2">
              {metrics.emailed}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Notices sent to staff inbox
            </span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#0e1d34] text-white shadow-2xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/70'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Right side: Status Tabs & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {isAdmin && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 self-start sm:self-auto">
              {(['Active', 'Archived', 'All'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notices..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Notices Feed */}
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
          Loading official notices...
        </div>
      ) : filteredNotices.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-slate-200 p-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
            <Megaphone className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-900">
            No notices published yet
          </h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {isAdmin
              ? 'Click "Publish Notice" to broadcast official directives, holiday circulars, or meeting details to all staff.'
              : 'There are no active notices or announcements at this time.'}
          </p>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Publish First Notice</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotices.map((notice) => {
            const isPinned =
              notice.IsPinned === true ||
              String(notice.IsPinned).toUpperCase() === 'TRUE';
            const isUrgent = notice.Priority === 'Urgent';
            const isHigh = notice.Priority === 'High';

            return (
              <div
                key={notice.NoticeID}
                className={`bg-white rounded-2xl border p-5 shadow-xs transition-all hover:shadow-md flex flex-col justify-between ${
                  isPinned
                    ? 'border-indigo-300 ring-2 ring-indigo-500/10 bg-gradient-to-r from-indigo-50/20 to-white'
                    : isUrgent
                    ? 'border-rose-300 ring-2 ring-rose-500/10'
                    : 'border-slate-200/90'
                }`}
              >
                <div>
                  {/* Top pill badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Pinned pill */}
                      {isPinned && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          <Pin className="w-3 h-3 text-indigo-600 fill-indigo-600" />
                          <span>Pinned</span>
                        </span>
                      )}

                      {/* Priority pill */}
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          isUrgent
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : isHigh
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isUrgent
                              ? 'bg-rose-500 animate-pulse'
                              : isHigh
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                          }`}
                        />
                        <span>{notice.Priority} Priority</span>
                      </span>

                      {/* Category tag */}
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {notice.Category}
                      </span>

                      {/* Email delivery pill */}
                      {notice.EmailStatus === 'Sent' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Mail className="w-3 h-3 text-emerald-600" />
                          <span>Emailed ({notice.EmailRecipientCount} staff)</span>
                        </span>
                      ) : notice.EmailStatus === 'Partial' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <Mail className="w-3 h-3 text-amber-600" />
                          <span>Partial ({notice.EmailRecipientCount} sent)</span>
                        </span>
                      ) : null}
                    </div>

                    {/* Published Date */}
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {notice.CreatedAt
                        ? new Date(notice.CreatedAt).toLocaleDateString(
                            'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            }
                          )
                        : 'Recent'}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug">
                    {notice.Title}
                  </h3>

                  {/* Creator and Metadata */}
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 mb-3">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      Issued by{' '}
                      <strong className="text-slate-600 font-semibold">
                        {notice.CreatorName || 'Administration'}
                      </strong>
                    </span>
                    <span>&bull;</span>
                    <span>ID: {notice.NoticeID}</span>
                  </div>

                  {/* Content Preview */}
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 bg-slate-50/60 p-3 rounded-xl border border-slate-100 whitespace-pre-line">
                    {notice.Content}
                  </p>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setInspectNotice(notice)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1a73e8] hover:text-[#1557b0] transition cursor-pointer px-2 py-1 rounded-lg hover:bg-blue-50"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Read Full Notice</span>
                  </button>

                  {isAdmin && (
                    <div className="flex items-center gap-1.5">
                      {/* Pin/Unpin */}
                      <button
                        type="button"
                        onClick={() => handleTogglePin(notice)}
                        disabled={actionLoadingId === notice.NoticeID}
                        className={`p-1.5 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                          isPinned
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                        title={isPinned ? 'Unpin notice' : 'Pin notice to top'}
                      >
                        <Pin className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">
                          {isPinned ? 'Unpin' : 'Pin'}
                        </span>
                      </button>

                      {/* Resend Email */}
                      <button
                        type="button"
                        onClick={() => handleResendEmail(notice)}
                        disabled={actionLoadingId === notice.NoticeID}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium transition cursor-pointer flex items-center gap-1"
                        title="Broadcast notice email again to active staff"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Resend Email</span>
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDeleteNotice(notice)}
                        disabled={actionLoadingId === notice.NoticeID}
                        className="p-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 text-xs font-medium transition cursor-pointer"
                        title="Delete notice"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. Modal: Create New Official Staff Notice                                */}
      {/* ========================================================================= */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#0e1d34] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">
                    Publish Official Staff Notice
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Broadcast an announcement and automatically email all staff members.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs (Form vs Preview) */}
            <div className="flex items-center border-b border-slate-200 bg-slate-50 px-6 pt-2">
              <button
                type="button"
                onClick={() => setPreviewTab('form')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer ${
                  previewTab === 'form'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Notice Details &amp; Options
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('preview')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  previewTab === 'preview'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Live Email &amp; Card Preview</span>
              </button>
            </div>

            {/* Form Content */}
            {previewTab === 'form' ? (
              <form onSubmit={handleCreateSubmit} className="p-6 space-y-5">
                {/* Quick Templates Selector */}
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Quick Fill Presets</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={() => applyTemplate(tpl)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition cursor-pointer border border-slate-200"
                      >
                        + {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Notice Headline / Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Official Holiday Notice: Upcoming Institutional Closure"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                  />
                </div>

                {/* Priority & Category in 2 columns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Priority Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Priority Level
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['Normal', 'High', 'Urgent'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setFormPriority(p)}
                          className={`py-2 px-2 text-center rounded-xl text-xs font-bold border transition cursor-pointer ${
                            formPriority === p
                              ? p === 'Urgent'
                                ? 'bg-rose-500 text-white border-rose-600 shadow-xs'
                                : p === 'High'
                                ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                                : 'bg-[#0e1d34] text-white border-slate-800 shadow-xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Notice Category
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                    >
                      <option value="General">General Announcement</option>
                      <option value="Policy">Policy Directive / Rule</option>
                      <option value="Holiday">Holiday &amp; Calendar Circular</option>
                      <option value="Event">Event / Staff Meeting</option>
                      <option value="Maintenance">Infrastructure / Maintenance</option>
                      <option value="Urgent">Emergency / Safety</option>
                    </select>
                  </div>
                </div>

                {/* Target Audience Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Target Audience / Email Recipients
                  </label>
                  <select
                    value={formTargetRole}
                    onChange={(e) => setFormTargetRole(e.target.value as 'All' | 'Staff' | 'Admin')}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                  >
                    <option value="All">All Active Staff &amp; Administrators</option>
                    <option value="Staff">Active Staff Members Only</option>
                    <option value="Admin">Administrators Only</option>
                  </select>
                </div>

                {/* Content / Message */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      Detailed Message / Circular Content{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-slate-400">
                      {formContent.length} characters
                    </span>
                  </div>
                  <textarea
                    required
                    rows={6}
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="Type the official communication here. Paragraphs and bullet points are preserved in the staff email dispatch..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono leading-relaxed"
                  />
                </div>

                {/* Options (Pin & Email) */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  {/* Pin to Top Toggle */}
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition">
                    <input
                      type="checkbox"
                      checked={formIsPinned}
                      onChange={(e) => setFormIsPinned(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Pin className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Pin this notice to top of staff dashboard</span>
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Pinned notices remain highlighted at the very top of the roster and notice feed.
                      </p>
                    </div>
                  </label>

                  {/* Email Broadcast Toggle */}
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-emerald-200/80 bg-emerald-50/30 hover:bg-emerald-50/50 transition">
                    <input
                      type="checkbox"
                      checked={formSendEmail}
                      onChange={(e) => setFormSendEmail(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Email this notice to all active staff members immediately</span>
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Dispatches a branded executive HTML circular directly to every staff member's registered email address and logs to the email audit trail.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Footer Buttons */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Broadcasting Notice...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Publish &amp; Broadcast</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              /* Live Email & Card Preview */
              <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    This preview shows how your notice will render in staff inboxes and on their dashboard.
                  </span>
                </div>

                {/* Mock Email Card */}
                <div className="border border-slate-300 rounded-2xl overflow-hidden shadow-lg bg-white max-w-lg mx-auto">
                  {/* Color Accent Bar */}
                  <div
                    className={`h-2 ${
                      formPriority === 'Urgent'
                        ? 'bg-rose-600'
                        : formPriority === 'High'
                        ? 'bg-amber-500'
                        : 'bg-blue-600'
                    }`}
                  />
                  {/* Brand Header */}
                  <div className="bg-[#0e1d34] text-white p-5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      TC Tracker &bull; Official Staff Notice
                    </div>
                    <h2 className="text-base font-bold leading-tight">
                      {formTitle.trim() || 'Notice Title Will Appear Here'}
                    </h2>
                  </div>

                  {/* Body Content */}
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          formPriority === 'Urgent'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : formPriority === 'High'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {formPriority} Priority
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {formCategory}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 border-b border-slate-100 pb-2">
                      <strong>Issued By:</strong>{' '}
                      {user?.fullName || 'System Administrator'} &bull;{' '}
                      {new Date().toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                      {formContent.trim() ||
                        'Your notice body text will be displayed here.'}
                    </div>

                    <div className="text-center pt-2">
                      <span className="inline-block px-4 py-2 rounded-lg bg-[#0e1d34] text-white text-xs font-bold">
                        Open TC Tracker Portal &rarr;
                      </span>
                    </div>
                  </div>

                  {/* Mock Email Footer */}
                  <div className="bg-slate-50 border-t border-slate-200 p-3 text-center text-[10px] text-slate-400">
                    TC Tracker &bull; IIT Research Park &bull; Automated Staff Notice Broadcast
                  </div>
                </div>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('form')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
                  >
                    &larr; Back to Edit Details
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. Modal: Inspect Full Notice                                             */}
      {/* ========================================================================= */}
      {inspectNotice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 bg-[#0e1d34] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold tracking-tight">
                  Official Notice Details
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInspectNotice(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    inspectNotice.Priority === 'Urgent'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : inspectNotice.Priority === 'High'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}
                >
                  {inspectNotice.Priority} Priority
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  {inspectNotice.Category}
                </span>
                {inspectNotice.EmailStatus === 'Sent' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Emailed ({inspectNotice.EmailRecipientCount} staff)
                  </span>
                )}
              </div>

              {/* Title */}
              <h2 className="text-lg font-black text-slate-900 leading-snug">
                {inspectNotice.Title}
              </h2>

              {/* Metadata */}
              <div className="text-xs text-slate-400 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <strong>Issued By:</strong>{' '}
                  <span className="text-slate-700 font-semibold">
                    {inspectNotice.CreatorName || 'Administration'}
                  </span>
                </div>
                <div>
                  <strong>Date:</strong>{' '}
                  <span className="text-slate-700 font-medium">
                    {new Date(inspectNotice.CreatedAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <strong>Notice ID:</strong>{' '}
                  <code className="text-slate-600 font-mono text-[11px]">
                    {inspectNotice.NoticeID}
                  </code>
                </div>
              </div>

              {/* Full Content */}
              <div className="p-4 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 leading-relaxed whitespace-pre-line font-sans">
                {inspectNotice.Content}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              {isAdmin ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleResendEmail(inspectNotice)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Broadcast Email Again</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteNotice(inspectNotice)}
                    className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 text-xs font-semibold transition cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setInspectNotice(null)}
                className="px-4 py-2 bg-[#0e1d34] hover:bg-[#162744] text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Close Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NoticesPage;

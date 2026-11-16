import React, { useState, useEffect, useMemo } from 'react';
import { fetchAllLeaveRequests } from '../services/api';
import type { LeaveRequestItem } from '../services/api';
import { PageHeader } from '../components/common/PageHeader';
import { SearchInput } from '../components/common/SearchInput';
import { StatusBadge } from '../components/common/StatusBadge';
import { TableSkeleton } from '../components/common/LoadingSkeleton';
import { AllocateSpecialLeaveModal } from '../components/leave/AllocateSpecialLeaveModal';
import {
  Filter,
  AlertCircle,
  Award,
} from 'lucide-react';

export const LeaveRequestsPage: React.FC = () => {
  const [requests, setRequests] = useState<LeaveRequestItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSpecialModalOpen, setIsSpecialModalOpen] = useState<boolean>(false);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAllLeaveRequests();
      setRequests(res.requests || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch leave requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const filteredRequests = useMemo(() => {
    let result = requests;

    if (selectedType !== 'All') {
      if (selectedType === 'Special Leave') {
        result = result.filter((r) => r.LeaveType.toLowerCase().startsWith('special leave'));
      } else {
        result = result.filter((r) => r.LeaveType.toLowerCase() === selectedType.toLowerCase());
      }
    }

    if (selectedStatus !== 'All') {
      result = result.filter((r) => {
        const s = (r.Status || 'Recorded').toLowerCase();
        return s === selectedStatus.toLowerCase();
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (r) =>
          (r.FullName && r.FullName.toLowerCase().includes(q)) ||
          (r.Email && r.Email.toLowerCase().includes(q)) ||
          r.UserID.toLowerCase().includes(q) ||
          r.Reason.toLowerCase().includes(q) ||
          (r.Remarks && r.Remarks.toLowerCase().includes(q)) ||
          r.LeaveRequestID.toLowerCase().includes(q)
      );
    }

    return result;
  }, [searchQuery, selectedType, selectedStatus, requests]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <PageHeader
        title="Leave Records"
        subtitle="Staff leave history across the laboratory."
        actions={
          <button
            type="button"
            onClick={() => setIsSpecialModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition shadow-2xs cursor-pointer"
          >
            <Award className="w-3.5 h-3.5 text-purple-200" />
            <span>Allocate Special Leave</span>
          </button>
        }
      />

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row items-center gap-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by staff name, email, User ID, or reason..."
          className="flex-1 w-full"
        />

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition w-full sm:w-auto shadow-2xs"
          >
            <option value="All">All Leave Types</option>
            <option value="Casual">Casual</option>
            <option value="Maternity/Paternity">Maternity/Paternity</option>
            <option value="Special Leave">Special Leave (Critical Section)</option>
            <option value="Other">Other</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition w-full sm:w-auto shadow-2xs"
          >
            <option value="All">All Statuses</option>
            <option value="Recorded">Recorded (Active)</option>
            <option value="Withdrawn">Withdrawn</option>
          </select>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 text-sm">Submitted Notices</h2>
          <span className="text-xs text-slate-500 font-medium">
            Showing {filteredRequests.length} of {requests.length} records
          </span>
        </div>

        {loading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : filteredRequests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase bg-slate-50/50 text-[10px]">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Request ID</th>
                  <th className="py-3 px-4">Leave Type</th>
                  <th className="py-3 px-4">Date Span</th>
                  <th className="py-3 px-4 text-center">Calculated Days</th>
                  <th className="py-3 px-4">Reason / Remarks</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Submitted At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((req) => (
                  <tr key={req.LeaveRequestID} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {req.FullName || req.UserID}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-mono">
                        <span>{req.Email || req.UserID}</span>
                        {req.Role && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-sans font-medium">
                            {req.Role}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] font-bold text-slate-700">
                      {req.LeaveRequestID}
                    </td>
                    <td className="py-3 px-4">
                      {req.LeaveType.startsWith('Special Leave') ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          <Award className="w-3 h-3 text-purple-600" />
                          <span>{req.LeaveType}</span>
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          {req.LeaveType}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {req.StartDate} &rarr; {req.EndDate}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-900">
                      <div>{req.CalculatedDays} {req.CalculatedDays === 1 ? 'day' : 'days'}</div>
                      {req.Remarks && req.Remarks.includes('(Exempt from Regular Balance)') && (
                        <span className="inline-block mt-0.5 text-[9px] px-1 py-0.2 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                          Exempt
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <p className="text-slate-800 font-medium truncate">
                        {req.Reason}
                      </p>
                      {req.Remarks && (
                        <p className="text-[11px] text-slate-400 truncate italic">
                          {req.Remarks}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge status={req.Status || 'Recorded'} size="sm" />
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-right whitespace-nowrap text-[11px]">
                      {req.SubmittedAt ? new Date(req.SubmittedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-xs text-slate-400">
            No leave requests matching your search criteria.
          </div>
        )}
      </div>

      {/* Allocate Special Leave Modal */}
      <AllocateSpecialLeaveModal
        isOpen={isSpecialModalOpen}
        onClose={() => setIsSpecialModalOpen(false)}
        onSuccess={() => {
          loadRequests();
        }}
      />
    </div>
  );
};

export default LeaveRequestsPage;

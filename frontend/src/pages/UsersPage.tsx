import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchUsers,
  createUser,
  updateUser,
  adminResetPasswordApi,
} from '../services/api';
import type { UserItem, UserRole } from '../services/api';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { SearchInput } from '../components/common/SearchInput';
import { useToast } from '../components/common/ToastContext';
import { TableSkeleton } from '../components/common/LoadingSkeleton';
import {
  UserPlus,
  Filter,
  CheckCircle2,
  AlertCircle,
  Edit2,
  X,
  ShieldAlert,
  KeyRound,
} from 'lucide-react';

const TODAY_DATE_STR = new Date().toISOString().split('T')[0];

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const isAdmin = currentUser?.role === 'Admin';

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Add User Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [addFullName, setAddFullName] = useState<string>('');
  const [addEmail, setAddEmail] = useState<string>('');
  const [addRole, setAddRole] = useState<UserRole>('Staff');
  const [addJoiningDate, setAddJoiningDate] = useState<string>(TODAY_DATE_STR);
  const [addIsActive, setAddIsActive] = useState<boolean>(true);
  const [submittingAdd, setSubmittingAdd] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit User Modal State (Admin only)
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editFullName, setEditFullName] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editRole, setEditRole] = useState<UserRole>('Staff');
  const [editJoiningDate, setEditJoiningDate] = useState<string>('');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [submittingEdit, setSubmittingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isUserActive = (isActive: boolean | string | number): boolean => {
    if (typeof isActive === 'boolean') return isActive;
    if (typeof isActive === 'number') return isActive === 1;
    if (typeof isActive === 'string') {
      const lower = isActive.trim().toLowerCase();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return false;
  };

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchUsers();
      setUsers(res.data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch user roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openAddModal = () => {
    setAddFullName('');
    setAddEmail('');
    setAddRole('Staff');
    setAddJoiningDate(TODAY_DATE_STR);
    setAddIsActive(true);
    setAddError(null);
    setIsAddModalOpen(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!addFullName.trim()) {
      setAddError('Full name is required.');
      return;
    }
    if (!addEmail.trim()) {
      setAddError('Email is required.');
      return;
    }
    if (!addJoiningDate) {
      setAddError('Joining date is required.');
      return;
    }

    setSubmittingAdd(true);
    try {
      await createUser({
        fullName: addFullName.trim(),
        email: addEmail.trim().toLowerCase(),
        role: addRole,
        joiningDate: addJoiningDate,
        isActive: addIsActive,
      });

      const msg = `User '${addFullName}' created successfully.`;
      setSuccess(msg);
      toast.success(msg, 'User Added');
      setIsAddModalOpen(false);
      await loadUsers();
    } catch (err: any) {
      const msg = err?.message || 'Failed to create user.';
      setAddError(msg);
      toast.error(msg, 'Creation Error');
    } finally {
      setSubmittingAdd(false);
    }
  };

  const openEditModal = (target: UserItem) => {
    setEditingUser(target);
    setEditFullName(target.FullName || '');
    setEditEmail(target.Email || '');
    setEditRole(target.Role as UserRole);
    setEditJoiningDate(target.JoiningDate || '');
    setEditIsActive(isUserActive(target.IsActive));
    setEditError(null);
    setIsEditModalOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);

    if (!editFullName.trim()) {
      setEditError('Full name cannot be empty.');
      return;
    }
    if (!editEmail.trim()) {
      setEditError('Email cannot be empty.');
      return;
    }
    if (!editJoiningDate) {
      setEditError('Joining date is required.');
      return;
    }

    setSubmittingEdit(true);
    try {
      await updateUser(editingUser.UserID, {
        fullName: editFullName.trim(),
        email: editEmail.trim().toLowerCase(),
        role: editRole,
        joiningDate: editJoiningDate,
        isActive: editIsActive,
      });

      const msg = `User '${editFullName}' updated successfully.`;
      setSuccess(msg);
      toast.success(msg, 'User Updated');
      setIsEditModalOpen(false);
      setEditingUser(null);
      await loadUsers();
    } catch (err: any) {
      const msg = err?.message || 'Failed to update user.';
      setEditError(msg);
      toast.error(msg, 'Update Error');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleAdminResetPassword = async (targetUser: UserItem) => {
    const confirm = window.confirm(
      `Are you sure you want to reset the password for ${targetUser.FullName} (${targetUser.Email})?\n\nA new temporary password will be generated and emailed to them immediately.`
    );
    if (!confirm) return;

    try {
      const res = await adminResetPasswordApi(targetUser.UserID);
      toast.success(res.message || 'Password reset and emailed successfully.', 'Password Reset');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset password.', 'Reset Failed');
    }
  };

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      (u.FullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.Email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.UserID || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'All' || u.Role === roleFilter;

    const activeBool = isUserActive(u.IsActive);
    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Active' && activeBool) ||
      (statusFilter === 'Inactive' && !activeBool);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const isSelfAccount = (targetUserId: string): boolean => {
    return currentUser?.userId === targetUserId;
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <PageHeader
        title="User & Team Roster"
        subtitle={
          isAdmin
            ? 'View roster, onboard team members, edit user roles, and manage active status.'
            : 'View roster and onboard new Staff members.'
        }
        badge={
          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold border bg-slate-100 text-slate-800 border-slate-300">
            Administrator Access
          </span>
        }
        actions={
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add User</span>
          </button>
        }
      />

      {/* Notifications */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">{success}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <SearchInput
          placeholder="Search by name, email, or UserID..."
          value={searchTerm}
          onChange={setSearchTerm}
          className="w-full md:w-80"
        />

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto text-xs">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-600">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="border border-slate-200 rounded-lg text-xs px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="All">All Roles</option>
              <option value="Staff">Staff</option>
              <option value="Admin">Admin</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-slate-200 rounded-lg text-xs px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No team members found matching your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">User ID</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Joining Date</th>
                  <th className="px-4 py-3">Account Status</th>
                  {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const active = isUserActive(u.IsActive);
                  const isCurrent = isSelfAccount(u.UserID);

                  return (
                    <tr key={u.UserID} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          <span>{u.FullName}</span>
                          {isCurrent && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium border border-slate-200">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">{u.Email}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                        {u.UserID}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={u.Role} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                        {u.JoiningDate || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={active ? 'Active' : 'Inactive'} size="sm" />
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleAdminResetPassword(u)}
                            title="Reset password and email temporary credentials"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:text-amber-800 hover:bg-amber-50 border border-amber-200/60 rounded-lg transition cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Reset Pwd</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">Add New User</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah Jenkins"
                  value={addFullName}
                  onChange={(e) => setAddFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Email Address * (Used for Google OAuth)
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. sarah.jenkins@example.com"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Account Role *
                </label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                >
                  <option value="Staff">Staff</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Joining Date * (YYYY-MM-DD)
                </label>
                <input
                  type="date"
                  required
                  value={addJoiningDate}
                  onChange={(e) => setAddJoiningDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Leave accrues at 2.5 days per completed calendar month of service, credited on the 1st of the following month.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="addIsActive"
                  checked={addIsActive}
                  onChange={(e) => setAddIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <label htmlFor="addIsActive" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Active Account (Permit sign-in via Google OAuth)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-200 text-slate-700 rounded-lg text-xs hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdd}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  {submittingAdd ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal (Admin Only) */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-slate-800" />
                <h3 className="font-bold text-slate-900 text-base">Edit User Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  User ID
                </label>
                <input
                  type="text"
                  disabled
                  value={editingUser.UserID}
                  className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg font-mono text-xs text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Account Role *
                </label>
                {isSelfAccount(editingUser.UserID) ? (
                  <div>
                    <input
                      type="text"
                      disabled
                      value={editRole}
                      className="w-full px-3 py-2 border border-amber-200 bg-amber-50 rounded-lg text-xs text-amber-800 cursor-not-allowed font-medium"
                    />
                    <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Security policy: You cannot change your own role.
                    </p>
                  </div>
                ) : (
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                  >
                    <option value="Staff">Staff</option>
                    <option value="Admin">Admin</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Joining Date *
                </label>
                <input
                  type="date"
                  required
                  value={editJoiningDate}
                  onChange={(e) => setEditJoiningDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <label htmlFor="editIsActive" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Active Account
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-200 text-slate-700 rounded-lg text-xs hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  {submittingEdit ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;

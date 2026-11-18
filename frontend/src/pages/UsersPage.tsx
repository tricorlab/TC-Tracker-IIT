import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  adminResetPasswordApi,
} from '../services/api';
import type { UserItem, UserRole } from '../services/api';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { SearchInput } from '../components/common/SearchInput';
import { useToast } from '../components/common/useToast';
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
  Trash2,
  UserX,
  Copy,
  Check,
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

  // Delete / Remove User Modal State (Admin only)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Temporary Credentials & Email Status Modal State
  const [resetModalData, setResetModalData] = useState<{
    isOpen: boolean;
    targetUser: UserItem | null;
    temporaryPassword: string;
    emailSent: boolean;
    message: string;
    errorMessage?: string;
  }>({
    isOpen: false,
    targetUser: null,
    temporaryPassword: '',
    emailSent: true,
    message: '',
  });
  const [copiedPass, setCopiedPass] = useState<boolean>(false);

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
      const res: any = await createUser({
        fullName: addFullName.trim(),
        email: addEmail.trim().toLowerCase(),
        role: addRole,
        joiningDate: addJoiningDate,
        isActive: addIsActive,
      });

      const isEmailSent = res?.emailDispatched;
      const msg = res?.message || `User '${addFullName}' created successfully.`;

      setSuccess(msg);
      if (isEmailSent === false) {
        toast.warning(msg, 'User Added (Email Notice)');
      } else {
        toast.success(msg, 'User Added');
      }
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
      setResetModalData({
        isOpen: true,
        targetUser,
        temporaryPassword: res.temporaryPassword || '',
        emailSent: res.emailSent !== false,
        message: res.message,
        errorMessage: res.errorMessage,
      });
      setCopiedPass(false);

      if (res.emailSent === false) {
        toast.warning(
          res.message || 'Password was reset, but email delivery could not be completed.',
          'Password Reset Notice'
        );
      } else {
        toast.success(res.message || 'Password reset and emailed successfully.', 'Password Reset');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset password.', 'Reset Failed');
    }
  };

  const copyTemporaryPassword = () => {
    if (!resetModalData.temporaryPassword) return;
    navigator.clipboard.writeText(resetModalData.temporaryPassword);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2500);
  };

  const openDeleteModal = (target: UserItem) => {
    setUserToDelete(target);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteUser = async (permanent: boolean) => {
    if (!userToDelete) return;
    setSubmittingDelete(true);
    setDeleteError(null);

    try {
      const res = await deleteUser(userToDelete.UserID, permanent);
      toast.success(res.message, permanent ? 'User Deleted' : 'User Deactivated');
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
      await loadUsers();
    } catch (err: any) {
      const msg = err?.message || 'Failed to remove user.';
      setDeleteError(msg);
      toast.error(msg, 'Action Error');
    } finally {
      setSubmittingDelete(false);
    }
  };

  const handleReactivateUser = async () => {
    if (!userToDelete) return;
    setSubmittingDelete(true);
    setDeleteError(null);

    try {
      await updateUser(userToDelete.UserID, { isActive: true });
      toast.success(`User '${userToDelete.FullName}' has been reactivated.`, 'User Reactivated');
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
      await loadUsers();
    } catch (err: any) {
      const msg = err?.message || 'Failed to reactivate user.';
      setDeleteError(msg);
      toast.error(msg, 'Reactivation Error');
    } finally {
      setSubmittingDelete(false);
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
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
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
                            {!isSelfAccount(u.UserID) && (
                              <button
                                type="button"
                                onClick={() => openDeleteModal(u)}
                                title="Delete or deactivate user"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-rose-800 hover:bg-rose-50 border border-rose-200/60 rounded-lg transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remove</span>
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredUsers.map((u) => {
                const active = isUserActive(u.IsActive);
                const isCurrent = isSelfAccount(u.UserID);

                return (
                  <div key={u.UserID} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate flex items-center gap-2">
                          <span>{u.FullName}</span>
                          {isCurrent && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium border border-slate-200">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                          {u.Email}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="flex items-center gap-1">
                          <StatusBadge status={u.Role} size="sm" />
                          <StatusBadge status={active ? 'Active' : 'Inactive'} size="sm" />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {u.UserID}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-50">
                      <span>Joined: <strong className="font-mono text-slate-700">{u.JoiningDate || '—'}</strong></span>
                    </div>

                    {/* Mobile Action Buttons */}
                    {isAdmin && (
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleAdminResetPassword(u)}
                          className="py-2 px-2 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/70 rounded-xl transition flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Reset Pwd</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(u)}
                          className="py-2 px-2 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        {!isSelfAccount(u.UserID) ? (
                          <button
                            type="button"
                            onClick={() => openDeleteModal(u)}
                            className="py-2 px-2 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/70 rounded-xl transition flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        ) : (
                          <div className="flex items-center justify-center text-[10px] text-slate-300 font-medium select-none">
                            Self Account
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
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

      {/* Remove / Delete User Modal (Admin Only) */}
      {isDeleteModalOpen && userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-slate-900 text-base">Remove / Delete User</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {deleteError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="my-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Employee Name:</span>
                <span className="font-bold text-slate-900">{userToDelete.FullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Email:</span>
                <span className="font-mono text-slate-800">{userToDelete.Email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Role:</span>
                <span className="font-semibold">{userToDelete.Role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Status:</span>
                <span>
                  {isUserActive(userToDelete.IsActive) ? (
                    <span className="text-emerald-700 font-semibold">Active</span>
                  ) : (
                    <span className="text-slate-500 font-semibold">Inactive / Deactivated</span>
                  )}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {/* Option 1: Soft Delete (Deactivate) */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5 text-amber-900">
                    <UserX className="w-4 h-4 text-amber-700" />
                    Strategy 1: Deactivate Account (Soft Delete)
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/80 text-amber-900">
                    Recommended
                  </span>
                </div>
                <p className="text-[11px] text-amber-900/80 leading-relaxed">
                  Disables login access and removes employee from active attendance rosters. Past punches, leave balances, and reports are <strong>preserved for audits and compliance</strong>.
                </p>
                {isUserActive(userToDelete.IsActive) ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteUser(false)}
                    disabled={submittingDelete}
                    className="w-full mt-1 py-1.5 px-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition cursor-pointer"
                  >
                    {submittingDelete ? 'Processing...' : 'Deactivate Employee'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleReactivateUser}
                    disabled={submittingDelete}
                    className="w-full mt-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition cursor-pointer"
                  >
                    {submittingDelete ? 'Processing...' : 'Reactivate Employee'}
                  </button>
                )}
              </div>

              {/* Option 2: Hard Delete (Permanent) */}
              <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl text-xs text-rose-950 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5 text-rose-900">
                    <Trash2 className="w-4 h-4 text-rose-700" />
                    Strategy 2: Permanently Delete (Hard Delete)
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-200/80 text-rose-900">
                    Permanent
                  </span>
                </div>
                <p className="text-[11px] text-rose-900/80 leading-relaxed">
                  Physically wipes the employee row from Google Sheets. Ideal for mistakenly created users or test accounts. Cannot be undone.
                </p>
                <button
                  type="button"
                  onClick={() => handleDeleteUser(true)}
                  disabled={submittingDelete}
                  className="w-full mt-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition cursor-pointer"
                >
                  {submittingDelete ? 'Processing...' : 'Permanently Delete User'}
                </button>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-3.5 py-1.5 border border-slate-200 text-slate-700 rounded-lg text-xs hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Temporary Password & Email Status Modal */}
      {resetModalData.isOpen && resetModalData.targetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-300" />
                <h3 className="font-bold text-lg">Temporary Login Credentials</h3>
              </div>
              <button
                type="button"
                onClick={() => setResetModalData((prev) => ({ ...prev, isOpen: false }))}
                className="text-white/80 hover:text-white rounded-lg p-1 transition cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Employee
                </p>
                <p className="text-sm font-bold text-slate-900">
                  {resetModalData.targetUser.FullName}
                </p>
                <p className="text-xs text-slate-600 font-mono">
                  {resetModalData.targetUser.Email}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  New Temporary Password
                </p>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-lg p-2.5">
                  <span className="font-mono font-bold text-base text-blue-900 flex-1 tracking-wider select-all">
                    {resetModalData.temporaryPassword}
                  </span>
                  <button
                    type="button"
                    onClick={copyTemporaryPassword}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition shadow-sm cursor-pointer"
                  >
                    {copiedPass ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-white" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {resetModalData.emailSent ? (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Email Dispatched:</span> Credentials email sent to{' '}
                    <span className="font-semibold">{resetModalData.targetUser.Email}</span>. The employee will be required to set a new password upon logging in.
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Email Notice:</span> Could not dispatch credentials email ({resetModalData.errorMessage || 'Email service not configured in environment'}).
                    <p className="mt-1 font-semibold text-amber-800">
                      Please copy the temporary password above and share it with the user directly.
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setResetModalData((prev) => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;

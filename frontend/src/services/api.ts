const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim();
export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '').replace(/\/api$/, '');

export function resolveApiUrl(endpoint: string): string {
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${clean}`;
}

export interface HealthResponse {
  success: boolean;
  message: string;
}

export type UserRole = 'Staff' | 'Admin';

export interface AuthUser {
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  mustChangePassword?: boolean;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: AuthUser;
  csrfToken?: string;
}

// In-memory CSRF token storage
let activeCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  activeCsrfToken = token;
}

export function getCsrfToken(): string | null {
  if (activeCsrfToken) return activeCsrfToken;
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

/* ========================================================================= */
/* Client-Side In-Memory Cache with TTL & Invalidation                      */
/* ========================================================================= */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const clientApiCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Cache TTL configuration (in milliseconds)
 */
export const CACHE_TTLS = {
  HOLIDAYS: 5 * 60 * 1000,          // 5 minutes
  USERS: 2 * 60 * 1000,             // 2 minutes
  ATTENDANCE_SUMMARY: 60 * 1000,    // 1 minute
  LEAVE_BALANCE: 60 * 1000,         // 1 minute
  REPORTS: 2 * 60 * 1000,           // 2 minutes
  POLICY: 5 * 60 * 1000,            // 5 minutes
  DASHBOARD: 30 * 1000,             // 30 seconds
} as const;

/**
 * Invalidate client cache by key or prefix.
 * If no prefix is provided, clears the entire cache.
 * Ensures user data isolation across sessions.
 */
export function clearClientCache(prefix?: string): void {
  if (!prefix) {
    clientApiCache.clear();
    inFlightRequests.clear();
    return;
  }
  for (const key of clientApiCache.keys()) {
    if (key.startsWith(prefix)) {
      clientApiCache.delete(key);
    }
  }
  for (const key of inFlightRequests.keys()) {
    if (key.startsWith(prefix)) {
      inFlightRequests.delete(key);
    }
  }
}

/**
 * Cached API fetch with TTL and concurrent in-flight deduplication.
 */
async function cachedApiFetch<T>(
  cacheKey: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = clientApiCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiry > now) {
    return typeof structuredClone === 'function'
      ? structuredClone(cached.data)
      : JSON.parse(JSON.stringify(cached.data));
  }

  // Deduplicate concurrent identical requests
  const existingPromise = inFlightRequests.get(cacheKey);
  if (existingPromise) {
    return existingPromise as Promise<T>;
  }

  const promise = (async () => {
    try {
      const data = await fetcher();
      clientApiCache.set(cacheKey, {
        data,
        expiry: Date.now() + ttlMs,
      });
      return typeof structuredClone === 'function'
        ? structuredClone(data)
        : JSON.parse(JSON.stringify(data));
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Universal authenticated API fetcher with CSRF protection for mutating requests.
 */
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  // Double-submit CSRF token for mutating requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }
  }

  const response = await fetch(resolveApiUrl(endpoint), {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type');
  let data: any = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  }

  if (!response.ok) {
    let fallbackMsg = `Request failed with status ${response.status}`;
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      fallbackMsg = 'The backend server is starting up or temporarily unavailable. Please retry in a moment.';
    }
    const errorMsg = data?.message || data?.error || fallbackMsg;
    throw new Error(errorMsg);
  }

  // Update CSRF token if returned in response
  if (data?.csrfToken) {
    setCsrfToken(data.csrfToken);
  }

  return data as T;
}

/**
 * Fetch API Health check
 */
export async function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/api/health');
}

/**
 * Send Google ID token to backend to verify and establish HTTP-only session
 */
export async function loginWithGoogleApi(idToken: string): Promise<AuthResponse> {
  clearClientCache();
  const data = await apiFetch<AuthResponse>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
  if (data.csrfToken) {
    setCsrfToken(data.csrfToken);
  }
  return data;
}

/**
 * Fetch current authenticated user session from backend
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const data = await apiFetch<AuthResponse>('/api/auth/me');
    if (data.csrfToken) {
      setCsrfToken(data.csrfToken);
    }
    return data.user || null;
  } catch {
    setCsrfToken(null);
    clearClientCache();
    return null;
  }
}

/**
 * Log out and clear session cookie
 */
export async function logoutApi(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    setCsrfToken(null);
    clearClientCache();
  }
}

/**
 * Sign in using Email and Password
 */
export async function loginWithPasswordApi(email: string, password: string): Promise<AuthResponse> {
  clearClientCache();
  const data = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.csrfToken) {
    setCsrfToken(data.csrfToken);
  }
  return data;
}

/**
 * Change authenticated user's password
 */
export async function changePasswordApi(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  return apiFetch('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/**
 * Request password reset (delivers both Reset Link and 6-Digit OTP via email)
 */
export async function requestForgotPasswordApi(
  email: string
): Promise<{ success: boolean; message: string }> {
  return apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/**
 * Complete password reset with Token (Strategy A) or 6-Digit OTP (Strategy B)
 */
export async function resetPasswordApi(
  email: string,
  tokenOrOtp: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  return apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, token: tokenOrOtp, otp: tokenOrOtp, newPassword }),
  });
}

/**
 * Admin triggers password reset for an employee (Strategy C - Admin Fallback)
 */
export async function adminResetPasswordApi(
  targetUserId: string
): Promise<{ success: boolean; temporaryPassword?: string; message: string }> {
  return apiFetch('/api/auth/admin/reset-password', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
}

/* ========================================================================= */
/* Phase 4: Attendance API Types & Functions                                 */
/* ========================================================================= */

export interface DailyAttendanceItem {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  attendanceId?: string;
  status: 'Present' | 'Absent' | 'Not Marked';
  markedBy?: string;
  updatedAt?: string;
}

export interface DailyAttendanceResponse {
  success: boolean;
  date: string;
  isSunday: boolean;
  isHoliday: boolean;
  holidayName?: string;
  totalStaff: number;
  presentCount: number;
  absentCount: number;
  notMarkedCount: number;
  staffAttendance: DailyAttendanceItem[];
}

export interface MonthlyAttendanceRecord {
  date: string;
  dayOfWeek: string;
  isSunday: boolean;
  isHoliday: boolean;
  holidayName?: string;
  status: 'Present' | 'Absent' | 'Not Marked';
  markedBy?: string;
  isLeave?: boolean;
  leaveType?: string;
  leaveRequestId?: string;
  isSpecialLeave?: boolean;
}

export interface MonthlyAttendanceSummary {
  userId: string;
  year: number;
  month: number;
  totalCalendarDays: number;
  totalWorkingDays: number;
  totalSundays: number;
  totalHolidays: number;
  presentCount: number;
  absentCount: number;
  notMarkedCount: number;
  leaveCount?: number;
  specialLeaveCount?: number;
  attendanceRate?: number;
  records: MonthlyAttendanceRecord[];
}

export async function fetchDailyAttendance(date: string): Promise<DailyAttendanceResponse> {
  const res = await apiFetch<any>(`/api/attendance/daily?date=${encodeURIComponent(date)}`);
  const payload = res?.data || res;
  return {
    success: true,
    date: payload?.date || date,
    isSunday: Boolean(payload?.isSunday),
    isHoliday: Boolean(payload?.isHoliday),
    holidayName: payload?.holidayName,
    totalStaff: payload?.totalStaff ?? (payload?.staffAttendance?.length || 0),
    presentCount: payload?.presentCount || 0,
    absentCount: payload?.absentCount || 0,
    notMarkedCount: payload?.notMarkedCount || 0,
    staffAttendance: Array.isArray(payload?.staffAttendance) ? payload.staffAttendance : [],
  };
}

export async function markDailyAttendance(
  date: string,
  entries: Array<{ userId: string; status: 'Present' | 'Absent' | 'Not Marked' }>
): Promise<{ success: boolean; message: string; savedCount: number }> {
  const res = await apiFetch<any>('/api/attendance/daily', {
    method: 'POST',
    body: JSON.stringify({ date, entries }),
  });
  // Invalidate attendance, reports, and dashboard caches on attendance change
  clearClientCache('attendance:');
  clearClientCache('reports:attendance:');
  clearClientCache('dashboard:');
  return {
    success: true,
    message: res?.message || 'Attendance saved successfully',
    savedCount: res?.savedCount ?? res?.data?.savedCount ?? entries.length,
  };
}

export async function fetchMonthlyAttendance(
  userId?: string,
  year?: number,
  month?: number
): Promise<{ success: boolean; summary: MonthlyAttendanceSummary }> {
  const params = new URLSearchParams();
  if (userId) params.append('userId', userId);
  if (year) params.append('year', year.toString());
  if (month) params.append('month', month.toString());

  const cacheKey = `attendance:monthly:${userId || 'self'}:${year || 'current'}:${month || 'current'}`;
  return cachedApiFetch(cacheKey, CACHE_TTLS.ATTENDANCE_SUMMARY, async () => {
    const res = await apiFetch<any>(`/api/attendance/monthly?${params.toString()}`);
    return {
      success: true,
      summary: res?.summary || res?.data || res,
    };
  });
}

/* ========================================================================= */
/* Phase 4: Holiday API Types & Functions                                    */
/* ========================================================================= */

export interface HolidayItem {
  HolidayID: string;
  HolidayName: string;
  HolidayDate: string;
  Description?: string;
  CreatedBy: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export async function fetchHolidays(year?: number): Promise<{ success: boolean; holidays: HolidayItem[]; data: HolidayItem[] }> {
  const url = year ? `/api/holidays?year=${year}` : '/api/holidays';
  const cacheKey = `holidays:${year || 'all'}`;
  return cachedApiFetch(cacheKey, CACHE_TTLS.HOLIDAYS, async () => {
    const res = await apiFetch<any>(url);
    const list = res?.holidays || res?.data || (Array.isArray(res) ? res : []);
    return { success: true, holidays: list, data: list };
  });
}

export async function createHoliday(data: {
  holidayName: string;
  holidayDate: string;
  description?: string;
}): Promise<{ success: boolean; message: string; holiday: HolidayItem }> {
  const res = await apiFetch<{ success: boolean; message: string; holiday: HolidayItem }>('/api/holidays', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  clearClientCache('holidays:');
  clearClientCache('dashboard:');
  clearClientCache('reports:');
  return res;
}

export async function updateHoliday(
  id: string,
  data: { holidayName: string; holidayDate: string; description?: string }
): Promise<{ success: boolean; message: string; holiday: HolidayItem }> {
  const res = await apiFetch<{ success: boolean; message: string; holiday: HolidayItem }>(`/api/holidays/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  clearClientCache('holidays:');
  clearClientCache('dashboard:');
  clearClientCache('reports:');
  return res;
}

export async function deleteHoliday(id: string): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch<{ success: boolean; message: string }>(`/api/holidays/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  clearClientCache('holidays:');
  clearClientCache('dashboard:');
  clearClientCache('reports:');
  return res;
}

/* ========================================================================= */
/* Phase 4: Leave API Types & Functions                                      */
/* ========================================================================= */

export interface LeaveCalculationResult {
  startDate: string;
  endDate: string;
  totalCalendarDays: number;
  sundaysCount: number;
  holidaysCount: number;
  workingDays: number;
  isContinuousSevenDaysOrMore: boolean;
  calculatedDays: number;
  ruleApplied: string;
  holidaysEncountered: string[];
  excludedDates?: string[];
}

export interface LeaveRequestItem {
  LeaveRequestID: string;
  UserID: string;
  FullName?: string;
  Email?: string;
  Role?: string;
  LeaveType: string;
  StartDate: string;
  EndDate: string;
  CalculatedDays: number;
  Reason: string;
  Remarks?: string;
  Status: string;
  SubmittedAt: string;
  CreatedAt: string;
}

export interface LeaveBalanceItem {
  LeaveBalanceID: string;
  UserID: string;
  CalendarYear: number;
  EarnedLeave: number;
  CarriedForward: number;
  UsedLeave: number;
  AvailableLeave: number;
  UpdatedAt: string;
  isCarryForwardExpired?: boolean;
  effectiveCarriedForward?: number;
  transitionPending?: boolean;
}

export interface YearTransitionPreviewItem {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  sourceEarned: number;
  sourceUsed: number;
  eligibleUnused: number;
  carryForwardAmount: number;
  lapsedAmount: number;
  status: 'Eligible' | 'Excluded';
  remarks?: string;
}

export interface YearTransitionPreviewResponse {
  success: boolean;
  data: {
    sourceYear: number;
    destinationYear: number;
    isAlreadyExecuted: boolean;
    alreadyExecutedDetails?: {
      executedAt: string;
      executedBy: string;
      reason?: string;
    };
    eligibleCount: number;
    totalCarried: number;
    totalLapsed: number;
    records: YearTransitionPreviewItem[];
    excludedRecords: YearTransitionPreviewItem[];
  };
}

export interface YearTransitionExecutionResponse {
  success: boolean;
  message: string;
  data: {
    success: boolean;
    sourceYear: number;
    destinationYear: number;
    executedAt: string;
    executedBy: string;
    processedCount: number;
    totalCarried: number;
    totalLapsed: number;
    summary: YearTransitionPreviewItem[];
  };
}

export interface LeavePolicyItem {
  PolicyID: string;
  AccrualRatePerMonth: number;
  MaxCarryForwardPercent: number;
  CarryForwardExpiryDate: string;
  EffectiveFrom: string;
  Remarks?: string;
}

export async function previewLeaveCalculation(
  startDate: string,
  endDate: string
): Promise<{ success: boolean; calculation: LeaveCalculationResult }> {
  return apiFetch(
    `/api/leave/calculate?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
  );
}

export async function submitLeaveRequest(data: {
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  remarks?: string;
}): Promise<{
  success: boolean;
  message: string;
  request: LeaveRequestItem;
  warning?: string;
  calculatedDays: number;
  availableBalance: number;
}> {
  const res = await apiFetch<{
    success: boolean;
    message: string;
    request: LeaveRequestItem;
    warning?: string;
    calculatedDays: number;
    availableBalance: number;
  }>('/api/leave/requests', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  // Invalidate cached leave requests, leave balances, and dashboards
  clearClientCache('leave:');
  clearClientCache('reports:leave:');
  clearClientCache('dashboard:');
  return res;
}

export async function fetchMyLeaveRequests(): Promise<{ success: boolean; requests: LeaveRequestItem[] }> {
  return cachedApiFetch('leave:my-requests', CACHE_TTLS.LEAVE_BALANCE, async () => {
    const res = await apiFetch<{ success: boolean; data?: LeaveRequestItem[]; requests?: LeaveRequestItem[] }>(
      '/api/leave/requests/my'
    );
    return {
      success: res.success,
      requests: res.requests || res.data || [],
    };
  });
}

export async function withdrawLeaveRequest(
  requestId: string,
  reason?: string
): Promise<{ success: boolean; message: string; request: LeaveRequestItem }> {
  const res = await apiFetch<{
    success: boolean;
    message: string;
    request: LeaveRequestItem;
  }>(`/api/leave/requests/${encodeURIComponent(requestId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  // Invalidate cached leave requests, leave balances, and dashboards
  clearClientCache('leave:');
  clearClientCache('reports:leave:');
  clearClientCache('dashboard:');
  return res;
}

export async function fetchAllLeaveRequests(): Promise<{ success: boolean; requests: LeaveRequestItem[] }> {
  return cachedApiFetch('leave:all-requests', CACHE_TTLS.LEAVE_BALANCE, async () => {
    const res = await apiFetch<{ success: boolean; data?: LeaveRequestItem[]; requests?: LeaveRequestItem[] }>(
      '/api/leave/requests'
    );
    return {
      success: res.success,
      requests: res.requests || res.data || [],
    };
  });
}

export async function fetchLeaveBalance(
  userId?: string,
  year?: number
): Promise<{ success: boolean; balance: LeaveBalanceItem }> {
  const params = new URLSearchParams();
  if (userId) params.append('userId', userId);
  if (year) params.append('year', year.toString());
  const cacheKey = `leave:balance:${userId || 'self'}:${year || 'current'}`;
  return cachedApiFetch(cacheKey, CACHE_TTLS.LEAVE_BALANCE, () =>
    apiFetch(`/api/leave/balance?${params.toString()}`)
  );
}

export async function fetchAllLeaveBalances(
  year?: number
): Promise<{ success: boolean; balances: LeaveBalanceItem[] }> {
  const url = year ? `/api/leave/balances?year=${year}` : '/api/leave/balances';
  const cacheKey = `leave:balances:all:${year || 'current'}`;
  return cachedApiFetch(cacheKey, CACHE_TTLS.LEAVE_BALANCE, () => apiFetch(url));
}

export async function adjustLeaveBalance(data: {
  userId: string;
  calendarYear: number;
  earnedLeave?: number;
  carriedForward?: number;
  usedLeave?: number;
  reason: string;
}): Promise<{ success: boolean; message: string; balance: LeaveBalanceItem }> {
  const res = await apiFetch<{ success: boolean; message: string; balance: LeaveBalanceItem }>('/api/leave/balances/adjust', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  clearClientCache('leave:');
  clearClientCache('reports:leave:');
  clearClientCache('dashboard:');
  return res;
}

export async function allocateSpecialLeave(data: {
  userIds: string[];
  criticalSection: string;
  startDate: string;
  endDate: string;
  reason: string;
  exemptFromBalance?: boolean;
  autoMarkPresent?: boolean;
  remarks?: string;
}): Promise<{
  success: boolean;
  message: string;
  data: {
    allocatedCount: number;
    requests: LeaveRequestItem[];
    autoMarkedAttendanceDays?: number;
  };
}> {
  const res = await apiFetch<{
    success: boolean;
    message: string;
    data: {
      allocatedCount: number;
      requests: LeaveRequestItem[];
      autoMarkedAttendanceDays?: number;
    };
  }>('/api/leave/special-allocation', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  clearClientCache('leave:');
  clearClientCache('reports:leave:');
  clearClientCache('attendance:');
  clearClientCache('reports:attendance:');
  clearClientCache('dashboard:');
  return res;
}

export async function fetchLeavePolicy(): Promise<{ success: boolean; policy: LeavePolicyItem }> {
  return cachedApiFetch('leave:policy', CACHE_TTLS.POLICY, () => apiFetch('/api/leave/policy'));
}

export async function updateLeavePolicy(data: {
  accrualRatePerMonth?: number;
  maxCarryForwardPercent?: number;
  carryForwardExpiryDate?: string;
  remarks?: string;
}): Promise<{ success: boolean; message: string; policy: LeavePolicyItem }> {
  const res = await apiFetch<{ success: boolean; message: string; policy: LeavePolicyItem }>('/api/leave/policy', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  clearClientCache('leave:policy');
  clearClientCache('dashboard:');
  return res;
}

export async function previewYearTransition(
  sourceYear: number,
  destinationYear: number
): Promise<YearTransitionPreviewResponse> {
  return apiFetch(
    `/api/leave/year-transition/preview?sourceYear=${sourceYear}&destinationYear=${destinationYear}`
  );
}

export async function executeYearTransition(data: {
  sourceYear: number;
  destinationYear: number;
  confirm: boolean;
}): Promise<YearTransitionExecutionResponse> {
  const res = await apiFetch<YearTransitionExecutionResponse>('/api/leave/year-transition/execute', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  clearClientCache('leave:');
  clearClientCache('reports:');
  clearClientCache('dashboard:');
  return res;
}

/* ========================================================================= */
/* Phase 4: Dashboard API Types & Functions                                  */
/* ========================================================================= */

export interface StaffDashboardData {
  user: {
    userId: string;
    fullName: string;
    email: string;
    role: string;
    joiningDate?: string;
  };
  balance: LeaveBalanceItem;
  monthlyAttendance: MonthlyAttendanceSummary;
  leaveSummary?: {
    accruedAllowance: number;
    leaveTaken: number;
    leaveTakenAllTime?: number;
    remainingAllowance?: number;
    isExceeded: boolean;
    excessDays: number;
  };
  recentRequests?: LeaveRequestItem[];
  recentLeaveRequests?: LeaveRequestItem[];
  recentAttendance?: MonthlyAttendanceRecord[];
  upcomingHolidays?: HolidayItem[];
}

export interface ManagerDashboardData {
  date?: string;
  selectedDate?: string;
  totalStaff?: number;
  presentCount?: number;
  absentCount?: number;
  notMarkedCount?: number;
  pendingNoticeCount?: number;
  attendanceSummary?: {
    totalStaff: number;
    presentCount: number;
    absentCount: number;
    notMarkedCount: number;
    isSunday: boolean;
    isHoliday: boolean;
    holidayName?: string;
  };
  upcomingHolidays?: HolidayItem[];
  staffAttendance?: Array<{
    userId: string;
    fullName: string;
    role: string;
    status: 'Present' | 'Absent' | 'Not Marked';
  }>;
  recentRequests?: Array<{
    RequestID: string;
    UserID: string;
    FullName?: string;
    Email?: string;
    Role?: string;
    StartDate: string;
    EndDate: string;
    RequestedDays: number | string;
    Reason?: string;
    SubmittedAt: string;
  }>;
}

export interface AdminDashboardData extends ManagerDashboardData {
  totalUsers?: number;
  activeStaffCount?: number;
  totalActiveStaff?: number;
  totalBalancesRecorded?: number;
  managersCount?: number;
  adminsCount?: number;
  onLeaveToday?: Array<{
    userId: string;
    fullName: string;
    email: string;
    role: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    calculatedDays: number;
    reason?: string;
  }>;
  leaveSummary?: {
    totalLeaveDaysTaken: number;
    totalRequestsCount: number;
    exceedingStaffCount: number;
    exceedingStaff: Array<{
      userId: string;
      fullName: string;
      email: string;
      accruedAllowance: number;
      leaveTaken: number;
      excessDays: number;
    }>;
  };
  recentActivity?: Array<{
    ActivityLogID: string;
    Action: string;
    EntityType: string;
    EntityID: string;
    Details: string;
    PerformedBy: string;
    CreatedAt: string;
  }>;
  recentActivityLogs?: Array<{
    LogID: string;
    PerformedBy: string;
    Action: string;
    EntityType: string;
    EntityID: string;
    PreviousValue?: string;
    NewValue?: string;
    Reason?: string;
    Timestamp: string;
  }>;
}

export async function fetchStaffDashboard(): Promise<{ success: boolean; dashboard: StaffDashboardData }> {
  return cachedApiFetch('dashboard:staff', CACHE_TTLS.DASHBOARD, async () => {
    const res = await apiFetch<any>('/api/dashboard/staff');
    return {
      success: true,
      dashboard: res?.dashboard || res?.data || res,
    };
  });
}

export async function fetchManagerDashboard(
  date?: string
): Promise<{ success: boolean; dashboard: ManagerDashboardData }> {
  const url = date ? `/api/dashboard/manager?date=${encodeURIComponent(date)}` : '/api/dashboard/manager';
  const cacheKey = `dashboard:manager:${date || 'today'}`;
  return cachedApiFetch(cacheKey, CACHE_TTLS.DASHBOARD, async () => {
    const res = await apiFetch<any>(url);
    return {
      success: true,
      dashboard: res?.dashboard || res?.data || res,
    };
  });
}

export async function fetchAdminDashboard(
  date?: string
): Promise<{ success: boolean; dashboard: AdminDashboardData }> {
  const url = date ? `/api/dashboard/admin?date=${encodeURIComponent(date)}` : '/api/dashboard/admin';
  const cacheKey = `dashboard:admin:${date || 'today'}`;
  return cachedApiFetch(cacheKey, CACHE_TTLS.DASHBOARD, async () => {
    const res = await apiFetch<any>(url);
    return {
      success: true,
      dashboard: res?.dashboard || res?.data || res,
    };
  });
}

export async function fetchActivityLogs(
  limit: number = 50
): Promise<{ success: boolean; logs: any[]; data: any[] }> {
  const res = await apiFetch<{ success: boolean; data?: any[]; logs?: any[] }>(
    `/api/dashboard/activity-logs?limit=${limit}`
  );
  const logList = Array.isArray(res.logs) ? res.logs : Array.isArray(res.data) ? res.data : [];
  return {
    success: res.success ?? true,
    logs: logList,
    data: logList,
  };
}

/* ========================================================================= */
/* Phase 5: User Management, Email Audit & Reports API Types & Functions      */
/* ========================================================================= */

export interface UserItem {
  UserID: string;
  FullName: string;
  Email: string;
  Role: UserRole;
  JoiningDate: string;
  IsActive: boolean | string;
  CreatedAt: string;
  UpdatedAt: string;
}

export async function fetchUsers(): Promise<{ success: boolean; data: UserItem[] }> {
  return cachedApiFetch('users:all', CACHE_TTLS.USERS, () => apiFetch('/api/users'));
}

export async function createUser(data: {
  fullName: string;
  email: string;
  role: UserRole;
  joiningDate: string;
  isActive?: boolean;
}): Promise<{ success: boolean; data: UserItem; message?: string }> {
  const res = await apiFetch<{ success: boolean; data: UserItem; message?: string }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  clearClientCache('users:');
  clearClientCache('reports:');
  clearClientCache('dashboard:');
  return res;
}

export async function updateUser(
  userId: string,
  data: {
    fullName?: string;
    email?: string;
    role?: UserRole;
    joiningDate?: string;
    isActive?: boolean;
  }
): Promise<{ success: boolean; data: UserItem; message?: string }> {
  const res = await apiFetch<{ success: boolean; data: UserItem; message?: string }>(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  clearClientCache('users:');
  clearClientCache('reports:');
  clearClientCache('dashboard:');
  return res;
}

export interface EmailLogItem {
  EmailLogID: string;
  RelatedLeaveRequestID: string;
  RecipientEmail: string;
  DeliveryStatus: 'Sent' | 'Failed';
  ErrorMessage: string;
  AttemptedAt: string;
  SentAt: string;
}

export async function fetchEmailLogs(): Promise<{ success: boolean; data: EmailLogItem[] }> {
  return apiFetch('/api/dashboard/email-logs');
}

export interface MonthlyAttendanceReportData {
  year?: number;
  month?: number;
  monthName?: string;
  startDate?: string;
  endDate?: string;
  periodTitle?: string;
  reportType?: 'monthly' | 'multi' | 'annual' | 'custom';
  totalEmployees: number;
  totalCalendarDays: number;
  totalWorkingDays: number;
  totalSundays: number;
  totalHolidays: number;
  overallTotals: {
    totalWorkingDays: number;
    totalPresent: number;
    totalAbsent: number;
    totalNotMarked: number;
    totalSundays: number;
    totalHolidays: number;
  };
  employeeSummaries: Array<{
    userId: string;
    fullName: string;
    email: string;
    role: string;
    joiningDate?: string;
    workingDays: number;
    presentCount: number;
    absentCount: number;
    notMarkedCount: number;
    sundaysCount: number;
    holidaysCount: number;
    attendanceRate: number;
  }>;
}

export interface AttendanceReportFilterParams {
  type?: 'monthly' | 'multi' | 'annual' | 'custom';
  year?: number;
  month?: number;
  startMonth?: number;
  endMonth?: number;
  startDate?: string;
  endDate?: string;
}

export async function fetchMonthlyAttendanceReport(
  yearOrParams: number | AttendanceReportFilterParams,
  month?: number
): Promise<{ success: boolean; data: MonthlyAttendanceReportData }> {
  let query = '';
  let cacheKey = '';

  if (typeof yearOrParams === 'object') {
    const params = yearOrParams;
    const parts: string[] = [];
    if (params.type) parts.push(`type=${encodeURIComponent(params.type)}`);
    if (params.year) parts.push(`year=${params.year}`);
    if (params.month) parts.push(`month=${params.month}`);
    if (params.startMonth) parts.push(`startMonth=${params.startMonth}`);
    if (params.endMonth) parts.push(`endMonth=${params.endMonth}`);
    if (params.startDate) parts.push(`startDate=${encodeURIComponent(params.startDate)}`);
    if (params.endDate) parts.push(`endDate=${encodeURIComponent(params.endDate)}`);
    query = parts.join('&');
    cacheKey = `reports:attendance:${query}`;
  } else {
    const year = yearOrParams;
    const m = month || (new Date().getUTCMonth() + 1);
    query = `year=${year}&month=${m}`;
    cacheKey = `reports:attendance:${year}:${m}`;
  }

  return cachedApiFetch(cacheKey, CACHE_TTLS.REPORTS, () =>
    apiFetch(`/api/reports/attendance${query ? `?${query}` : ''}`)
  );
}

export interface AnnualLeaveBalanceReportData {
  year: number;
  totalEmployees: number;
  totalExceedingEmployees?: number;
  overallTotals: {
    totalEarned: number;
    totalCarried: number;
    totalUsed: number;
    totalAvailable: number;
  };
  balances: Array<{
    userId: string;
    fullName: string;
    email: string;
    role: string;
    joiningDate: string;
    earnedLeave: number;
    carriedForward: number;
    isCarryForwardExpired: boolean;
    effectiveCarriedForward: number;
    usedLeave: number;
    availableLeave: number;
    totalAllowance?: number;
    isExceeded?: boolean;
    exceededBy?: number;
    transitionPending: boolean;
  }>;
}

export async function fetchLeaveBalanceReport(
  year: number
): Promise<{ success: boolean; data: AnnualLeaveBalanceReportData }> {
  const cacheKey = `reports:leave:${year}`;
  return cachedApiFetch(cacheKey, CACHE_TTLS.REPORTS, async () => {
    const res = await apiFetch<{
      success: boolean;
      data?: AnnualLeaveBalanceReportData;
      report?: AnnualLeaveBalanceReportData;
    }>(`/api/reports/leave-balances?year=${year}`);
    const reportData = res.data || (res as any).report || (res as any);
    return {
      success: res.success ?? true,
      data: reportData,
    };
  });
}

/**
 * Download report CSV using authenticated fetch and browser blob.
 */
export async function downloadReportCsv(
  endpoint: string,
  defaultFilename: string
): Promise<void> {
  const csrf = getCsrfToken();
  const headers = new Headers();
  if (csrf) {
    headers.set('X-CSRF-Token', csrf);
  }

  const response = await fetch(resolveApiUrl(endpoint), {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to download report: ${response.statusText}`);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}

/* ========================================================================= */
/* Phase 6: Database Doctor & Diagnostics Types & Functions                  */
/* ========================================================================= */

export interface WorksheetDiagnostic {
  sheetName: string;
  exists: boolean;
  headersValid: boolean;
  actualHeaders: string[];
  expectedHeaders: readonly string[];
  missingHeaders: string[];
  unexpectedHeaders: string[];
  rowCount?: number;
  status: 'Healthy' | 'MissingSheet' | 'HeaderMismatch' | 'Empty';
}

export interface DatabaseDiagnosticsReport {
  status: 'HEALTHY' | 'ACTION_REQUIRED' | 'UNCONFIGURED';
  isConfigured: boolean;
  configuration: {
    spreadsheetIdMasked: string;
    serviceAccountEmailMasked: string;
    isPrivateKeySet: boolean;
    isEmailConfigured: boolean;
  };
  spreadsheetTitle?: string;
  totalCanonicalSheets: number;
  validSheetsCount: number;
  missingSheetsCount: number;
  headerMismatchCount: number;
  sheets: WorksheetDiagnostic[];
  diagnosedAt: string;
}

export interface DatabaseRepairResult {
  success: boolean;
  performedBy: string;
  repairedAt: string;
  createdSheets: string[];
  initializedHeaders: string[];
  alreadyValidSheets: string[];
  unresolvedIssues: string[];
  message: string;
}

export async function fetchDatabaseDiagnostics(): Promise<{
  success: boolean;
  data: DatabaseDiagnosticsReport;
}> {
  return apiFetch('/api/dashboard/database-doctor');
}

export async function repairDatabaseSchema(
  confirm: boolean
): Promise<{
  success: boolean;
  data: DatabaseRepairResult;
}> {
  const res = await apiFetch<{
    success: boolean;
    data: DatabaseRepairResult;
  }>('/api/dashboard/database-doctor/repair', {
    method: 'POST',
    body: JSON.stringify({ confirm }),
  });
  // Clear all client cache on database schema repair
  clearClientCache();
  return res;
}

/* ========================================================================= */
/* Database Backup & Snapshot Export API                                     */
/* ========================================================================= */

export interface BackupStatusResponse {
  success: boolean;
  data: {
    lastBackupAt: string | null;
    lastPerformedBy: string | null;
    totalBackupsRecorded: number;
    lastBackupDetails?: {
      filename?: string;
      totalRecords?: number;
      checksum?: string;
      sheetCounts?: Record<string, number>;
    } | null;
  };
}

/**
 * Fetch latest database backup audit status.
 */
export async function fetchBackupStatusApi(): Promise<BackupStatusResponse> {
  return apiFetch<BackupStatusResponse>('/api/dashboard/backup/status');
}

/**
 * Export and download full database JSON backup snapshot with SHA-256 checksum.
 */
export async function downloadDatabaseBackupApi(): Promise<{ checksum?: string; filename: string }> {
  const csrf = getCsrfToken();
  const headers = new Headers();
  if (csrf) {
    headers.set('X-CSRF-Token', csrf);
  }

  const response = await fetch(resolveApiUrl('/api/dashboard/backup/export'), {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || `Failed to export database backup: ${response.statusText}`);
  }

  const checksum = response.headers.get('x-checksum-sha256') || undefined;
  const disposition = response.headers.get('content-disposition');
  let filename = `tc-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      filename = match[1].trim();
    }
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);

  return { checksum, filename };
}

/* ========================================================================= */
/* Google Drive Semi-Annual Automated Backup API (Format A: Spreadsheet Clone) */
/* ========================================================================= */

export interface DriveBackupStatusData {
  isConfigured: boolean;
  folderConfigured: boolean;
  folderIdMasked: string;
  lastBackup: {
    fileId: string;
    title: string;
    webViewLink: string;
    createdAt: string;
    performedBy: string;
  } | null;
  nextScheduledDate: string;
  daysRemaining: number;
  scheduleFrequency: string;
}

export interface DriveBackupExecutionData {
  success: boolean;
  fileId: string;
  title: string;
  webViewLink: string;
  folderId?: string;
  createdAt: string;
  performedBy: string;
  size?: string;
  message: string;
}

export async function fetchDriveBackupStatus(): Promise<{ success: boolean; data: DriveBackupStatusData }> {
  return apiFetch('/api/dashboard/backup/drive/status');
}

export async function executeDriveBackupApi(customTitle?: string): Promise<{
  success: boolean;
  data: DriveBackupExecutionData;
  message: string;
}> {
  return apiFetch('/api/dashboard/backup/drive/execute', {
    method: 'POST',
    body: JSON.stringify({ customTitle }),
  });
}





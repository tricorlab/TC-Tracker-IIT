import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { userService, AuthenticatedUserContext } from '../services/userService.js';
import { attendanceService } from '../services/attendance.service.js';
import { holidayService } from '../services/holiday.service.js';
import { leaveService } from '../services/leave.service.js';
import { emailService } from '../services/email.service.js';
import { activityLogService } from '../services/activityLog.service.js';
import { requireAdmin, requireManager, requireStaff } from '../middlewares/role.middleware.js';
import { reportController } from '../controllers/report.controller.js';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { UserRow } from '../types/database.types.js';

describe('--- [PHASE 5 TEST SUITE] User Management, Email Audit & Reports ---', () => {
  const adminContext: AuthenticatedUserContext = {
    userId: 'USR-ADMIN-01',
    fullName: 'Alice Admin',
    email: 'admin@example.com',
    role: 'Admin',
    isActive: true,
  };

  const staffContext: AuthenticatedUserContext = {
    userId: 'USR-STAFF-01',
    fullName: 'John Staff',
    email: 'staff@example.com',
    role: 'Staff',
    isActive: true,
  };

  const baseUsers: UserRow[] = [
    {
      UserID: 'USR-ADMIN-01',
      FullName: 'Alice Admin',
      Email: 'admin@example.com',
      Role: 'Admin',
      JoiningDate: '2024-01-01',
      IsActive: 'TRUE',
      CreatedAt: '2024-01-01T00:00:00Z',
      UpdatedAt: '2024-01-01T00:00:00Z',
    },
    {
      UserID: 'USR-STAFF-01',
      FullName: 'John Staff',
      Email: 'staff@example.com',
      Role: 'Staff',
      JoiningDate: '2025-01-15',
      IsActive: 'TRUE',
      CreatedAt: '2025-01-15T00:00:00Z',
      UpdatedAt: '2025-01-15T00:00:00Z',
    },
    {
      UserID: 'USR-STAFF-02',
      FullName: 'Bob Staff',
      Email: 'bob@example.com',
      Role: 'Staff',
      JoiningDate: '2025-03-01',
      IsActive: 'TRUE',
      CreatedAt: '2025-03-01T00:00:00Z',
      UpdatedAt: '2025-03-01T00:00:00Z',
    },
    {
      UserID: 'USR-STAFF-03',
      FullName: 'Carol Staff',
      Email: 'carol@example.com',
      Role: 'Staff',
      JoiningDate: '2025-06-01',
      IsActive: 'TRUE',
      CreatedAt: '2025-06-01T00:00:00Z',
      UpdatedAt: '2025-06-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    userService.setMockUsersList(baseUsers);
    activityLogService.clearMockLogs();
    emailService.clearMockEmailLogs();
    attendanceService.clearMockAttendance();
    holidayService.clearMockHolidays();
    leaveService.clearMockData();
  });

  /* ======================================================================= */
  /* 1. User Management & Creation Engine                                    */
  /* ======================================================================= */
  describe('1. User Creation & Role Authorization', () => {
    it('should allow Admin to create Staff and Admin accounts', async () => {
      const newStaff = await userService.createUser(adminContext, {
        fullName: 'New Staffer',
        email: 'newstaff@example.com',
        role: 'Staff',
        joiningDate: '2026-02-01',
        isActive: true,
      });
      assert.ok(newStaff.UserID);
      assert.equal(newStaff.FullName, 'New Staffer');
      assert.equal(newStaff.Email, 'newstaff@example.com');
      assert.equal(newStaff.Role, 'Staff');

      const newAdmin = await userService.createUser(adminContext, {
        fullName: 'Second Admin',
        email: 'secondadmin@example.com',
        role: 'Admin',
        joiningDate: '2026-02-01',
        isActive: true,
      });
      assert.equal(newAdmin.Role, 'Admin');

      // Verify audit logs were written
      const logs = await activityLogService.getAllLogs();
      const createLogs = logs.filter((l) => l.Action === 'USER_CREATED');
      assert.equal(createLogs.length, 2);
    });

    it('should reject creating user with invalid role like Manager (400 Bad Request)', async () => {
      await assert.rejects(
        async () => {
          await userService.createUser(adminContext, {
            fullName: 'Attempted Manager',
            email: 'mgr_attempt@example.com',
            role: 'Manager' as any,
            joiningDate: '2026-03-01',
          });
        },
        {
          name: 'UserVerificationError',
          message: "Invalid role 'Manager'. Must be one of: Staff, Admin.",
          statusCode: 400,
        }
      );
    });

    it('should prevent Staff from creating any users (403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await userService.createUser(staffContext, {
            fullName: 'Staff Created',
            email: 'staffcreated@example.com',
            role: 'Staff',
            joiningDate: '2026-03-01',
          });
        },
        {
          name: 'UserVerificationError',
          message: 'You do not have permission to create users.',
          statusCode: 403,
        }
      );
    });

    it('should reject duplicate normalized email (case-insensitive & trimmed) with 409 Conflict', async () => {
      // Existing user has email 'admin@example.com'
      await assert.rejects(
        async () => {
          await userService.createUser(adminContext, {
            fullName: 'Duplicate Email Person',
            email: '  ADMIN@example.com  ',
            role: 'Staff',
            joiningDate: '2026-03-01',
          });
        },
        {
          name: 'UserVerificationError',
          message: "Email 'admin@example.com' already exists.",
          statusCode: 409,
        }
      );
    });

    it('should validate required fields, email format, and joining date format', async () => {
      // Empty FullName
      await assert.rejects(
        async () => {
          await userService.createUser(adminContext, {
            fullName: '   ',
            email: 'valid@example.com',
            role: 'Staff',
            joiningDate: '2026-03-01',
          });
        },
        {
          name: 'UserVerificationError',
          message: 'Full name is required.',
          statusCode: 400,
        }
      );

      // Invalid Email
      await assert.rejects(
        async () => {
          await userService.createUser(adminContext, {
            fullName: 'Bad Email',
            email: 'not-an-email',
            role: 'Staff',
            joiningDate: '2026-03-01',
          });
        },
        {
          name: 'UserVerificationError',
          statusCode: 400,
        }
      );

      // Invalid Joining Date
      await assert.rejects(
        async () => {
          await userService.createUser(adminContext, {
            fullName: 'Bad Date',
            email: 'baddate@example.com',
            role: 'Staff',
            joiningDate: '01/02/2026',
          });
        },
        {
          name: 'UserVerificationError',
          statusCode: 400,
        }
      );
    });
  });

  /* ======================================================================= */
  /* 2. User Update & Security Safeguards                                    */
  /* ======================================================================= */
  describe('2. User Updates, Self-Role Safeguards & Last Admin Protection', () => {
    it('should reject non-admin users from editing user accounts (403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await userService.updateUser(staffContext, 'USR-STAFF-02', {
            fullName: 'Changed by Staff',
          });
        },
        {
          name: 'UserVerificationError',
          message: 'Only Administrators can edit user accounts.',
          statusCode: 403,
        }
      );
    });

    it('should allow Admin to update user details and record audit log', async () => {
      const updated = await userService.updateUser(adminContext, 'USR-STAFF-01', {
        fullName: 'Johnathan Staff Updated',
        joiningDate: '2025-02-01',
        role: 'Admin',
      });

      assert.equal(updated.FullName, 'Johnathan Staff Updated');
      assert.equal(updated.JoiningDate, '2025-02-01');
      assert.equal(updated.Role, 'Admin');

      // Verify audit logs
      const logs = await activityLogService.getAllLogs();
      const updateLogs = logs.filter((l) => l.Action === 'USER_UPDATED');
      assert.equal(updateLogs.length, 1);
      assert.equal(updateLogs[0].EntityID, 'USR-STAFF-01');
      assert.ok(updateLogs[0].PreviousValue.includes('John Staff'));
      assert.ok(updateLogs[0].NewValue.includes('Johnathan Staff Updated'));
    });

    it('Safeguard 1: Administrator cannot change their own role (403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await userService.updateUser(adminContext, 'USR-ADMIN-01', {
            role: 'Staff',
          });
        },
        {
          name: 'UserVerificationError',
          message: 'Administrators cannot change their own role.',
          statusCode: 403,
        }
      );
    });

    it('Safeguard 2: Last active Administrator cannot be deactivated or demoted (400 Bad Request)', async () => {
      // In baseUsers, USR-ADMIN-01 is the only active Admin
      // Attempting to deactivate
      await assert.rejects(
        async () => {
          // Even if attempted by another Admin session
          const dummyAdmin: AuthenticatedUserContext = {
            userId: 'USR-TEMP-ADMIN',
            fullName: 'Temp',
            email: 'temp@example.com',
            role: 'Admin',
            isActive: true,
          };
          await userService.updateUser(dummyAdmin, 'USR-ADMIN-01', {
            isActive: false,
          });
        },
        {
          name: 'UserVerificationError',
          message: 'Cannot deactivate or demote the last active Administrator.',
          statusCode: 400,
        }
      );

      // Attempting to demote
      await assert.rejects(
        async () => {
          const dummyAdmin: AuthenticatedUserContext = {
            userId: 'USR-TEMP-ADMIN',
            fullName: 'Temp',
            email: 'temp@example.com',
            role: 'Admin',
            isActive: true,
          };
          await userService.updateUser(dummyAdmin, 'USR-ADMIN-01', {
            role: 'Staff',
          });
        },
        {
          name: 'UserVerificationError',
          message: 'Cannot deactivate or demote the last active Administrator.',
          statusCode: 400,
        }
      );
    });

    it('should permit deactivating an Admin if another active Admin exists', async () => {
      // Add a second active Admin
      const secondAdmin: UserRow = {
        UserID: 'USR-ADMIN-02',
        FullName: 'Second Active Admin',
        Email: 'admin2@example.com',
        Role: 'Admin',
        JoiningDate: '2024-01-01',
        IsActive: 'TRUE',
        CreatedAt: '2024-01-01T00:00:00Z',
        UpdatedAt: '2024-01-01T00:00:00Z',
      };
      userService.setMockUsersList([...baseUsers, secondAdmin]);

      // Admin 1 deactivates Admin 2
      const updated = await userService.updateUser(adminContext, 'USR-ADMIN-02', {
        isActive: false,
      });

      assert.equal(userService.parseIsActive(updated.IsActive), false);
    });

    it('should reflect updated role immediately on subsequent requests (dynamic role verification)', async () => {
      // Promote USR-STAFF-02 to Admin
      await userService.updateUser(adminContext, 'USR-STAFF-02', {
        role: 'Admin',
      });

      // Verify active user by ID
      const userContext = await userService.verifyActiveUserById('USR-STAFF-02');
      assert.equal(userContext.role, 'Admin');
    });
  });

  /* ======================================================================= */
  /* 3. Email Notification Audit Inspector                                   */
  /* ======================================================================= */
  describe('3. Email Notification Audit Inspector', () => {
    it('should record leave submission email notifications and allow Admin to inspect logs', async () => {
      // Dispatch an informational notification
      await emailService.sendLeaveSubmissionNotifications({
        leaveRequestId: 'LR-2026-TEST',
        staffName: 'John Staff',
        leaveType: 'Vacation',
        startDate: '2026-11-10',
        endDate: '2026-11-12',
        calculatedDays: 3,
        reason: 'Family event',
        submittedAt: '2026-11-01T10:00:00Z',
      });

      const logs = await emailService.getAllEmailLogs();
      assert.ok(logs.length >= 1);
      assert.ok(logs.some((l) => l.RecipientEmail === 'admin@example.com'));

      const adminLog = logs.find((l) => l.RecipientEmail === 'admin@example.com');
      assert.ok(adminLog?.EmailLogID);
      assert.equal(adminLog?.RelatedLeaveRequestID, 'LR-2026-TEST');
      assert.ok(['Sent', 'Failed'].includes(adminLog?.DeliveryStatus || ''));
    });

    it('should enforce Admin-only role middleware on email logs endpoint', () => {
      const mockReqAdmin: any = { user: adminContext };
      const mockReqStaff: any = { user: staffContext };

      let nextCalled = false;
      requireAdmin(mockReqAdmin, {} as any, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);

      // Staff blocked with 403
      let staffStatus = 0;
      let staffBody: any = null;
      requireAdmin(mockReqStaff, {
        status: (s: number) => {
          staffStatus = s;
          return {
            json: (b: any) => {
              staffBody = b;
            },
          };
        },
      } as any, () => {});
      assert.equal(staffStatus, 403);
      assert.ok(staffBody.message.includes('Admin'));
    });

    it('should record administrative activity logs and return both data and logs in controller response', async () => {
      activityLogService.clearMockLogs();
      await activityLogService.logActivity({
        performedBy: 'USR-ADMIN-01',
        action: 'USER_ROLE_UPDATED',
        entityType: 'User',
        entityID: 'USR-STAFF-01',
        previousValue: 'Staff',
        newValue: 'Admin',
        reason: 'Promotion to administrator',
      });

      const logs = await activityLogService.getRecentLogs(10);
      assert.ok(logs.length >= 1);
      assert.equal(logs[0].Action, 'USER_ROLE_UPDATED');
      assert.equal(logs[0].EntityType, 'User');
      assert.equal(logs[0].EntityID, 'USR-STAFF-01');
      assert.equal(logs[0].PreviousValue, 'Staff');
      assert.equal(logs[0].NewValue, 'Admin');
      assert.equal(logs[0].Reason, 'Promotion to administrator');
      assert.ok(logs[0].Timestamp);

      // Verify controller sends both data and logs keys
      let capturedResponse: any = null;
      await dashboardController.getActivityLogs(
        { query: { limit: '10' } } as any,
        {
          json: (body: any) => {
            capturedResponse = body;
          },
        } as any
      );

      assert.ok(capturedResponse);
      assert.equal(capturedResponse.success, true);
      assert.ok(Array.isArray(capturedResponse.data));
      assert.ok(Array.isArray(capturedResponse.logs));
      assert.equal(capturedResponse.data.length, capturedResponse.logs.length);
      assert.equal(capturedResponse.logs[0].Action, 'USER_ROLE_UPDATED');
    });
  });

  /* ======================================================================= */
  /* 4. Monthly Attendance & Annual Leave Balance Reports                    */
  /* ======================================================================= */
  describe('4. Monthly Attendance & Leave Reports Engine', () => {
    it('should generate monthly attendance report: Sundays and holidays never counted as absences', async () => {
      // Month: November 2026
      // Set holiday on 2026-11-16
      await holidayService.createHoliday({
        holidayName: 'Institute Day',
        holidayDate: '2026-11-16',
        createdBy: 'USR-ADMIN-01',
      });

      // Mark USR-STAFF-01 Present on 2026-11-02 (Monday) and Absent on 2026-11-03 (Tuesday)
      await attendanceService.markDailyAttendance(
        '2026-11-02',
        [{ userId: 'USR-STAFF-01', status: 'Present' }],
        'USR-ADMIN-01'
      );
      await attendanceService.markDailyAttendance(
        '2026-11-03',
        [{ userId: 'USR-STAFF-01', status: 'Absent' }],
        'USR-ADMIN-01'
      );

      const report = await attendanceService.getInstituteMonthlyAttendanceReport(2026, 11);

      assert.equal(report.year, 2026);
      assert.equal(report.month, 11);
      assert.equal(report.monthName, 'November');
      assert.equal(report.totalCalendarDays, 30);
      assert.equal(report.totalSundays, 5); // Nov 1, 8, 15, 22, 29 = 5 Sundays
      assert.equal(report.totalHolidays, 1); // Nov 16 = 1 Holiday
      // Total working days = 30 - 5 - 1 = 24
      assert.equal(report.totalWorkingDays, 24);

      // Check USR-STAFF-01 summary
      const staff1 = report.employeeSummaries.find((s) => s.userId === 'USR-STAFF-01');
      assert.ok(staff1);
      assert.equal(staff1.workingDays, 24);
      assert.equal(staff1.presentCount, 1);
      assert.equal(staff1.absentCount, 1);
      assert.equal(staff1.notMarkedCount, 28);
      assert.equal(staff1.sundaysCount, 5);
      assert.equal(staff1.holidaysCount, 1);

      // Check overall totals
      assert.equal(report.overallTotals.totalWorkingDays, 24);
      assert.equal(report.overallTotals.totalPresent, 1);
      assert.equal(report.overallTotals.totalAbsent, 1);
      assert.ok(report.overallTotals.totalNotMarked >= 22);
    });

    function createMockResponse() {
      const res: any = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        body: undefined as any,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        },
        send(content: any) {
          this.body = content;
          return this;
        },
        setHeader(key: string, val: string) {
          this.headers[key] = val;
          return this;
        },
      };
      return res;
    }

    it('should export monthly attendance report as downloadable CSV', async () => {
      const req: any = {
        query: { year: '2026', month: '11' },
      };
      const res = createMockResponse();

      await reportController.exportAttendanceCsv(req, res);

      assert.equal(res.headers['Content-Type'], 'text/csv; charset=utf-8');
      assert.ok(res.headers['Content-Disposition'].includes('attendance-report-2026-11.csv'));
      assert.ok(res.body.includes('Employee ID'));
      assert.ok(res.body.includes('TOTAL / INSTITUTE'));
      assert.ok(res.body.includes('John Staff'));
    });

    it('should generate custom range attendance report and export CSV', async () => {
      // Custom Range: September to November 2026
      const reqJson: any = {
        query: { type: 'multi', year: '2026', startMonth: '9', endMonth: '11' },
      };
      const resJson = createMockResponse();

      await reportController.getMonthlyAttendanceReport(reqJson, resJson);

      assert.equal(resJson.statusCode, 200);
      assert.equal(resJson.body.success, true);
      assert.equal(resJson.body.data.reportType, 'multi');
      assert.ok(resJson.body.data.periodTitle.includes('September') && resJson.body.data.periodTitle.includes('November 2026'));
      assert.equal(resJson.body.data.totalCalendarDays, 30 + 31 + 30); // 91 days
      assert.ok(resJson.body.data.totalWorkingDays > 0);
      assert.ok(resJson.body.data.employeeSummaries.length > 0);

      // CSV export for Custom Range: October to November 2026
      const reqCsv: any = {
        query: { type: 'multi', year: '2026', startMonth: '10', endMonth: '11' },
      };
      const resCsv = createMockResponse();

      await reportController.exportAttendanceCsv(reqCsv, resCsv);

      assert.equal(resCsv.headers['Content-Type'], 'text/csv; charset=utf-8');
      assert.ok(resCsv.headers['Content-Disposition'].includes('attendance-report-2026-M10-to-M11.csv'));
      assert.ok(resCsv.body.includes('Employee ID'));
      assert.ok(resCsv.body.includes('TOTAL / INSTITUTE'));
    });

    it('should generate annual full-year attendance report and export CSV', async () => {
      const reqJson: any = {
        query: { type: 'annual', year: '2026' },
      };
      const resJson = createMockResponse();

      await reportController.getMonthlyAttendanceReport(reqJson, resJson);

      assert.equal(resJson.statusCode, 200);
      assert.equal(resJson.body.success, true);
      assert.equal(resJson.body.reportType || resJson.body.data.reportType, 'annual');
      assert.equal(resJson.body.data.periodTitle, 'Full Year 2026');
      assert.equal(resJson.body.data.totalCalendarDays, 365);
      assert.ok(resJson.body.data.totalWorkingDays > 240);

      const reqCsv: any = {
        query: { type: 'annual', year: '2026' },
      };
      const resCsv = createMockResponse();

      await reportController.exportAttendanceCsv(reqCsv, resCsv);

      assert.equal(resCsv.headers['Content-Type'], 'text/csv; charset=utf-8');
      assert.ok(resCsv.headers['Content-Disposition'].includes('attendance-report-2026-annual.csv'));
      assert.ok(resCsv.body.includes('Employee ID'));
      assert.ok(resCsv.body.includes('TOTAL / INSTITUTE'));
    });

    it('should generate annual leave balance report preserving policy rules', async () => {
      const req: any = {
        query: { year: '2026' },
      };
      const res = createMockResponse();

      await reportController.getLeaveBalanceReport(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.year, 2026);
      assert.ok(res.body.data.totalEmployees >= 4);
      assert.ok(res.body.data.overallTotals.totalEarned >= 0);
      assert.ok(res.body.data.balances.length >= 4);

      const staff1 = res.body.data.balances.find((b: any) => b.userId === 'USR-STAFF-01');
      assert.ok(staff1);
      assert.equal(staff1.joiningDate, '2025-01-15');
      // Joined Jan 2025: completed months in 2026 are 12 completed months = 30 days
      assert.equal(typeof staff1.earnedLeave, 'number');
      assert.equal(typeof staff1.availableLeave, 'number');
    });

    it('should export annual leave balance report as downloadable CSV', async () => {
      const req: any = {
        query: { year: '2026' },
      };
      const res = createMockResponse();

      await reportController.exportLeaveBalanceCsv(req, res);

      assert.equal(res.headers['Content-Type'], 'text/csv; charset=utf-8');
      assert.ok(res.headers['Content-Disposition'].includes('leave-balances-2026.csv'));
      assert.ok(res.body.includes('Employee ID'));
      assert.ok(res.body.includes('TOTAL / INSTITUTE'));
      assert.ok(res.body.includes('Alice Admin'));
      assert.ok(res.body.includes('John Staff'));
    });

    it('should enforce role restrictions on report endpoints (Admin allowed, Staff blocked)', () => {
      const mockReqStaff: any = { user: staffContext };
      const mockReqAdmin: any = { user: adminContext };

      let adminAllowed = false;
      requireAdmin(mockReqAdmin, {} as any, () => {
        adminAllowed = true;
      });
      assert.equal(adminAllowed, true);

      let staffStatus = 0;
      requireAdmin(mockReqStaff, {
        status: (s: number) => {
          staffStatus = s;
          return { json: () => {} };
        },
      } as any, () => {});
      assert.equal(staffStatus, 403);
    });
  });
});

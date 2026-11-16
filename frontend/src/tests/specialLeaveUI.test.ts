import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('--- [FRONTEND TEST SUITE] TC Tracker Special Leave Allocation UI Verification ---', () => {
  const modalPath = path.resolve('src/components/leave/AllocateSpecialLeaveModal.tsx');
  const leaveMgmtPath = path.resolve('src/pages/LeaveManagementPage.tsx');
  const leaveReqsPath = path.resolve('src/pages/LeaveRequestsPage.tsx');
  const myLeavePath = path.resolve('src/pages/MyLeavePage.tsx');
  const apiPath = path.resolve('src/services/api.ts');

  it('1. should verify api.ts exports allocateSpecialLeave client helper with cache clearing', () => {
    assert.ok(fs.existsSync(apiPath), 'api.ts must exist');
    const content = fs.readFileSync(apiPath, 'utf-8');
    assert.ok(content.includes('export async function allocateSpecialLeave'), 'api.ts must export allocateSpecialLeave');
    assert.ok(content.includes('/api/leave/special-allocation'), 'Must post to /api/leave/special-allocation');
    assert.ok(content.includes("clearClientCache('leave:')"), 'Must clear leave cache');
    assert.ok(content.includes("clearClientCache('dashboard:')"), 'Must clear dashboard cache');
  });

  it('2. should verify AllocateSpecialLeaveModal component implements required features', () => {
    assert.ok(fs.existsSync(modalPath), 'AllocateSpecialLeaveModal.tsx must exist');
    const content = fs.readFileSync(modalPath, 'utf-8');
    assert.ok(content.includes('AllocateSpecialLeaveModal'), 'Component must be exported');
    assert.ok(content.includes('CRITICAL_SECTION_PRESETS'), 'Must define critical section presets');
    assert.ok(content.includes('Academic / Exam Critical Duty'), 'Must contain academic/exam preset');
    assert.ok(content.includes('Medical Emergency / Quarantine'), 'Must contain medical emergency preset');
    assert.ok(content.includes('previewLeaveCalculation'), 'Must use previewLeaveCalculation for live day calculation');
    assert.ok(content.includes('exemptFromBalance'), 'Must implement exemptFromBalance toggle');
    assert.ok(content.includes('autoMarkPresent'), 'Must implement autoMarkPresent toggle');
    assert.ok(content.includes('selectedUserIds'), 'Must support multi-employee selection');
    assert.ok(content.includes('reason'), 'Must require justification reason');
  });

  it('3. should verify LeaveManagementPage integrates Allocate Special Leave button and modal', () => {
    assert.ok(fs.existsSync(leaveMgmtPath), 'LeaveManagementPage.tsx must exist');
    const content = fs.readFileSync(leaveMgmtPath, 'utf-8');
    assert.ok(content.includes('AllocateSpecialLeaveModal'), 'Must import AllocateSpecialLeaveModal');
    assert.ok(content.includes('Allocate Special Leave'), 'Must contain Allocate Special Leave button text');
    assert.ok(content.includes('isSpecialLeaveModalOpen'), 'Must manage modal open state');
  });

  it('4. should verify LeaveRequestsPage integrates Allocate Special Leave button, filter, and modal', () => {
    assert.ok(fs.existsSync(leaveReqsPath), 'LeaveRequestsPage.tsx must exist');
    const content = fs.readFileSync(leaveReqsPath, 'utf-8');
    assert.ok(content.includes('AllocateSpecialLeaveModal'), 'Must import AllocateSpecialLeaveModal');
    assert.ok(content.includes('Allocate Special Leave'), 'Must contain Allocate Special Leave button in header');
    assert.ok(content.includes('Special Leave (Critical Section)'), 'Must include Special Leave option in filter dropdown');
    assert.ok(content.includes("req.LeaveType.startsWith('Special Leave')"), 'Must visually style Special Leave badges');
  });

  it('5. should verify MyLeavePage renders Special Leave indicator and exemption tag for staff', () => {
    assert.ok(fs.existsSync(myLeavePath), 'MyLeavePage.tsx must exist');
    const content = fs.readFileSync(myLeavePath, 'utf-8');
    assert.ok(content.includes("req.LeaveType.startsWith('Special Leave')"), 'Must detect Special Leave records');
    assert.ok(content.includes('(Exempt from Regular Balance)'), 'Must detect exempt leaves in remarks');
  });
});

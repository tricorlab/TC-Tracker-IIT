import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('--- [FRONTEND TEST SUITE] TC Tracker Monthly Attendance Health Card & Self-Verification ---', () => {
  const cardPath = path.resolve('src/components/attendance/MonthlyHealthCard.tsx');
  const dashboardPath = path.resolve('src/pages/DashboardPage.tsx');
  const myAttendancePath = path.resolve('src/pages/MyAttendancePage.tsx');
  const apiPath = path.resolve('src/services/api.ts');

  it('1. should verify MonthlyHealthCard.tsx exists and exports MonthlyHealthCard component', () => {
    assert.ok(fs.existsSync(cardPath), 'MonthlyHealthCard.tsx must exist');
    const content = fs.readFileSync(cardPath, 'utf-8');
    assert.ok(content.includes('export const MonthlyHealthCard'), 'Must export MonthlyHealthCard component');
    assert.ok(content.includes('MonthlyHealthCardProps'), 'Must define MonthlyHealthCardProps');
  });

  it('2. should verify multi-segment progress bar and target needle are implemented', () => {
    const content = fs.readFileSync(cardPath, 'utf-8');
    assert.ok(content.includes('Target'), 'Must render Target pin label');
    assert.ok(content.includes('left-[80%]'), 'Must position needle marker at 80% benchmark');
    assert.ok(content.includes('bg-emerald-500'), 'Must render Present segment with emerald color');
    assert.ok(content.includes('bg-rose-500'), 'Must render Absent segment with rose color');
  });

  it('3. should verify unnecessary clutter texts are completely removed from the card', () => {
    const content = fs.readFileSync(cardPath, 'utf-8');
    assert.ok(
      !content.includes('Self-verification scorecard with working-day arithmetic and daily punch log.'),
      'Must NOT include verbose tagline subtitle'
    );
    assert.ok(
      !content.includes('How is this calculated?'),
      'Must NOT include "How is this calculated?" button'
    );
    assert.ok(
      !content.includes('Attention Required (Below 80% Target)'),
      'Must NOT include "Attention Required (Below 80% Target)" badge'
    );
  });

  it('4. should verify 31-day verification micro-ribbon with click-to-inspect punch detail', () => {
    const content = fs.readFileSync(cardPath, 'utf-8');
    assert.ok(content.includes('Daily Attendance Punch Log'), 'Must render ribbon header');
    assert.ok(content.includes('setSelectedRecord'), 'Must handle day chip selection for inspection');
    assert.ok(content.includes('Official institute holiday'), 'Must explain holiday classification on inspected date');
    assert.ok(content.includes('Standard weekly off'), 'Must explain Sunday classification on inspected date');
    assert.ok(content.includes('Submit Leave Notice'), 'Must provide link to submit leave notice for absences');
  });

  it('5. should verify printable official monthly attendance verification statement slip', () => {
    const content = fs.readFileSync(cardPath, 'utf-8');
    assert.ok(content.includes('Verify Slip'), 'Must have Verify Slip trigger button');
    assert.ok(content.includes('Attendance Verification Statement'), 'Must display formal slip letterhead');
    assert.ok(content.includes('window.print()'), 'Must integrate browser print utility');
    assert.ok(content.includes('DIGITALLY VERIFIED'), 'Must display verification watermark/stamp');
  });

  it('6. should verify DashboardPage.tsx and MyAttendancePage.tsx integrate MonthlyHealthCard', () => {
    const dashContent = fs.readFileSync(dashboardPath, 'utf-8');
    assert.ok(dashContent.includes('MonthlyHealthCard'), 'DashboardPage must import and render MonthlyHealthCard');
    assert.ok(dashContent.includes('showDownloadSlip={true}'), 'DashboardPage must enable download slip');

    const myAttContent = fs.readFileSync(myAttendancePath, 'utf-8');
    assert.ok(myAttContent.includes('MonthlyHealthCard'), 'MyAttendancePage must import and render MonthlyHealthCard');
  });

  it('7. should verify api.ts enriches MonthlyAttendanceSummary and MonthlyAttendanceRecord types', () => {
    const apiContent = fs.readFileSync(apiPath, 'utf-8');
    assert.ok(apiContent.includes('specialLeaveCount?: number;'), 'Must support specialLeaveCount');
    assert.ok(apiContent.includes('attendanceRate?: number;'), 'Must support attendanceRate');
    assert.ok(apiContent.includes('isSpecialLeave?: boolean;'), 'Must support isSpecialLeave on record');
    assert.ok(apiContent.includes('leaveRequestId?: string;'), 'Must support leaveRequestId on record');
  });
});

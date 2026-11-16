import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { holidayService } from '../services/holiday.service.js';
import { leavePolicyService } from '../services/leavePolicy.service.js';

async function check() {
  console.log('--- Checking 2026 Holidays ---');
  const holidays = await holidayService.getHolidaysByYear(2026);
  console.log('2026 Holidays count:', holidays.length);
  console.log(JSON.stringify(holidays, null, 2));

  console.log('\n--- Calculating Leave Days for 2026-11-13 to 2026-11-17 ---');
  const calc = await leavePolicyService.calculateLeaveDays('2026-11-13', '2026-11-17');
  console.log('Calculation breakdown:');
  console.log(JSON.stringify(calc, null, 2));
}

check().catch(console.error);

import { googleSheetsService } from '../services/googleSheets.service.js';
import { SHEET_NAMES, SHEET_SCHEMAS } from '../config/sheets.config.js';
import { UserRow } from '../types/database.types.js';
import { hashPassword, validatePasswordStrength } from '../utils/password.util.js';
import { validateWorksheetHeaders } from '../validation/sheetValidators.js';

async function main() {
  console.log('====================================================');
  console.log('   TC TRACKER — ADMIN USER PROVISIONING & SETUP     ');
  console.log('====================================================\n');

  if (!googleSheetsService.isConfigured()) {
    console.error('Google Sheets credentials are not configured in backend/.env!');
    process.exit(1);
  }

  // Parse command line arguments or use defaults
  const args = process.argv.slice(2);
  const targetEmail = (args[0] || 'devamruth6282@gmail.com').trim().toLowerCase();
  const fullName = args[1] || 'Dev Amruth';
  const role = args[2] || 'Admin';
  const rawPassword = args[3] || 'DevAmruth@123';

  console.log(`Target Email   : ${targetEmail}`);
  console.log(`Full Name      : ${fullName}`);
  console.log(`Role           : ${role}`);
  console.log(`Password       : ${rawPassword}`);
  console.log('----------------------------------------------------\n');

  const pwdValidation = validatePasswordStrength(rawPassword);
  if (!pwdValidation.isValid) {
    console.error(`Password validation error: ${pwdValidation.errors.join(' ')}`);
    process.exit(1);
  }

  // Step 1: Ensure Users sheet has all 15 canonical headers
  console.log('[1/4] Checking Users sheet headers...');
  const currentHeaders = await googleSheetsService.getWorksheetHeaders(SHEET_NAMES.USERS);
  const headerValidation = validateWorksheetHeaders(SHEET_NAMES.USERS, currentHeaders);

  if (!headerValidation.isValid) {
    console.log(`[SCHEMA] Updating Row 1 headers to canonical 15 columns for "${SHEET_NAMES.USERS}"...`);
    const expectedHeaders = [...SHEET_SCHEMAS[SHEET_NAMES.USERS]];
    const endColLetter = String.fromCharCode(65 + expectedHeaders.length - 1);
    await googleSheetsService.updateSheetRange(`${SHEET_NAMES.USERS}!A1:${endColLetter}1`, [expectedHeaders]);
    console.log(`[SCHEMA] Headers updated successfully to A1:${endColLetter}1.`);
  } else {
    console.log(`[SCHEMA] Headers are already up-to-date (${currentHeaders.length} columns).`);
  }

  // Step 2: Fetch all existing users
  console.log('\n[2/4] Fetching existing user records from Google Sheets...');
  const existingUsers = await googleSheetsService.getSheetRecords<UserRow>(SHEET_NAMES.USERS);
  console.log(`Found ${existingUsers.length} user(s) in "${SHEET_NAMES.USERS}" sheet.`);

  const existingIdx = existingUsers.findIndex(
    (u) => (u.Email || '').trim().toLowerCase() === targetEmail
  );

  const now = new Date().toISOString();
  const todayDate = now.slice(0, 10);
  const passwordHash = hashPassword(rawPassword);

  if (existingIdx !== -1) {
    const existing = existingUsers[existingIdx];
    console.log(`\n[3/4] User with email "${targetEmail}" already exists:`);
    console.log({
      UserID: existing.UserID,
      FullName: existing.FullName,
      Email: existing.Email,
      Role: existing.Role,
      IsActive: existing.IsActive,
      HasPassword: Boolean(existing.PasswordHash && existing.PasswordHash.trim().length > 0),
      MustChangePassword: existing.MustChangePassword,
    });

    const sheetRowIndex = existingIdx + 2; // Row 1 is header, 1-based index
    console.log(`\n[4/4] Updating credentials for existing user at row ${sheetRowIndex}...`);

    const updatedUser: UserRow = {
      UserID: existing.UserID || `USR-${Date.now().toString().slice(-6)}`,
      FullName: fullName || existing.FullName,
      Email: targetEmail,
      Role: role as any,
      JoiningDate: existing.JoiningDate || todayDate,
      IsActive: 'TRUE',
      CreatedAt: existing.CreatedAt || now,
      UpdatedAt: now,
      PasswordHash: passwordHash,
      MustChangePassword: 'TRUE',
      ResetToken: '',
      ResetOtp: '',
      ResetTokenExpires: '',
      ResetOtpAttempts: 0,
      PasswordChangedAt: now,
    };

    const targetRange = `${SHEET_NAMES.USERS}!A${sheetRowIndex}:O${sheetRowIndex}`;
    await googleSheetsService.updateSheetRange(targetRange, [
      [
        updatedUser.UserID,
        updatedUser.FullName,
        updatedUser.Email,
        updatedUser.Role,
        updatedUser.JoiningDate,
        updatedUser.IsActive,
        updatedUser.CreatedAt,
        updatedUser.UpdatedAt,
        updatedUser.PasswordHash,
        updatedUser.MustChangePassword,
        updatedUser.ResetToken || '',
        updatedUser.ResetOtp || '',
        updatedUser.ResetTokenExpires || '',
        String(updatedUser.ResetOtpAttempts ?? 0),
        updatedUser.PasswordChangedAt || '',
      ],
    ]);

    console.log(`\n====================================================`);
    console.log('   USER CREDENTIALS SUCCESSFULLY UPDATED!           ');
    console.log('====================================================');
    console.log(`UserID             : ${updatedUser.UserID}`);
    console.log(`Email (Login ID)   : ${updatedUser.Email}`);
    console.log(`Password           : ${rawPassword}`);
    console.log(`Role               : ${updatedUser.Role}`);
    console.log(`MustChangePassword : TRUE (User will be prompted to reset upon login)`);
    console.log('====================================================\n');
    return;
  }

  // Step 3: Create new user
  const newUserId = `USR-${Date.now().toString().slice(-6)}`;
  const newUser: UserRow = {
    UserID: newUserId,
    FullName: fullName,
    Email: targetEmail,
    Role: role as any,
    JoiningDate: todayDate,
    IsActive: 'TRUE',
    CreatedAt: now,
    UpdatedAt: now,
    PasswordHash: passwordHash,
    MustChangePassword: 'TRUE',
    ResetToken: '',
    ResetOtp: '',
    ResetTokenExpires: '',
    ResetOtpAttempts: 0,
    PasswordChangedAt: now,
  };

  console.log(`\n[3/4] Creating new ${newUser.Role} user:`, {
    UserID: newUser.UserID,
    FullName: newUser.FullName,
    Email: newUser.Email,
    Role: newUser.Role,
  });

  console.log('\n[4/4] Appending row to Google Sheets...');
  await googleSheetsService.appendSheetRow(SHEET_NAMES.USERS, [
    newUser.UserID,
    newUser.FullName,
    newUser.Email,
    newUser.Role,
    newUser.JoiningDate,
    newUser.IsActive,
    newUser.CreatedAt,
    newUser.UpdatedAt,
    newUser.PasswordHash,
    newUser.MustChangePassword,
    newUser.ResetToken || '',
    newUser.ResetOtp || '',
    newUser.ResetTokenExpires || '',
    String(newUser.ResetOtpAttempts ?? 0),
    newUser.PasswordChangedAt || '',
  ]);

  console.log(`\n====================================================`);
  console.log('   USER SUCCESSFULLY PROVISIONED IN GOOGLE SHEETS!  ');
  console.log('====================================================');
  console.log(`UserID             : ${newUser.UserID}`);
  console.log(`Email (Login ID)   : ${newUser.Email}`);
  console.log(`Password           : ${rawPassword}`);
  console.log(`Role               : ${newUser.Role}`);
  console.log(`MustChangePassword : TRUE (User will be prompted to change upon login)`);
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('\n[FATAL ERROR] Failed to provision user:', err);
  process.exit(1);
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('--- [FRONTEND TEST SUITE] Google Drive Semi-Annual Backup UI Verification ---', () => {
  const apiPath = path.resolve('src/services/api.ts');
  const databaseDoctorPath = path.resolve('src/pages/DatabaseDoctorPage.tsx');

  it('1. should verify api.ts exports Google Drive backup types and API client functions', () => {
    assert.ok(fs.existsSync(apiPath), 'api.ts must exist');
    const content = fs.readFileSync(apiPath, 'utf-8');

    assert.ok(content.includes('export interface DriveBackupStatusData'), 'Must export DriveBackupStatusData');
    assert.ok(content.includes('export interface DriveBackupExecutionData'), 'Must export DriveBackupExecutionData');
    assert.ok(content.includes('export async function fetchDriveBackupStatus'), 'Must export fetchDriveBackupStatus()');
    assert.ok(content.includes('export async function executeDriveBackupApi'), 'Must export executeDriveBackupApi()');
  });

  it('2. should verify DatabaseDoctorPage.tsx renders the Google Drive Semi-Annual Cloud Backup card', () => {
    assert.ok(fs.existsSync(databaseDoctorPath), 'DatabaseDoctorPage.tsx must exist');
    const content = fs.readFileSync(databaseDoctorPath, 'utf-8');

    assert.ok(content.includes('Google Drive Semi-Annual Cloud Backup'), 'Must contain Google Drive backup heading');
    assert.ok(content.includes('Format A (Spreadsheet Clone)'), 'Must indicate Format A clone badge');
    assert.ok(content.includes('Backup to Drive Now'), 'Must provide Backup to Drive Now button');
    assert.ok(content.includes('Open in Drive'), 'Must provide Open in Drive link for direct Google Drive access');
    assert.ok(content.includes('Last Drive Backup'), 'Must display Last Drive Backup status cell');
    assert.ok(content.includes('Next Scheduled Backup'), 'Must display Next Scheduled Backup with countdown');
    assert.ok(content.includes('Google Drive Target'), 'Must display destination folder information');
  });
});

import { google, sheets_v4 } from 'googleapis';
import { config } from '../config/env.config.js';

class GoogleSheetsService {
  private sheetsClient: sheets_v4.Sheets | null = null;

  /**
   * Check if necessary Google Service Account credentials and Spreadsheet ID are configured.
   */
  public isConfigured(): boolean {
    return Boolean(
      config.google.serviceAccountEmail &&
      config.google.privateKey &&
      config.google.spreadsheetId
    );
  }

  /**
   * Authenticate and initialize the Google Sheets API client using Service Account.
   */
  private async getClient(): Promise<sheets_v4.Sheets> {
    if (this.sheetsClient) {
      return this.sheetsClient;
    }

    if (!this.isConfigured()) {
      throw new Error(
        'Google Sheets service is not configured. Missing GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, or GOOGLE_SPREADSHEET_ID.'
      );
    }

    try {
      const auth = new google.auth.JWT({
        email: config.google.serviceAccountEmail,
        key: config.google.privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheetsClient = google.sheets({ version: 'v4', auth });
      return this.sheetsClient;
    } catch (error: any) {
      throw new Error(`Failed to initialize Google Sheets client: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Reusable function to fetch row values from a specified range.
   * Example: getSheetValues('Users!A1:Z')
   */
  public async getSheetValues(range: string): Promise<any[][]> {
    const sheets = await this.getClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range,
    });

    return response.data.values || [];
  }

  /**
   * Reusable function to append a new row of values to a sheet.
   * Example: appendSheetRow('Users!A:Z', ['U001', 'John Doe', 'john@example.com', 'STAFF'])
   */
  public async appendSheetRow(range: string, values: any[]): Promise<sheets_v4.Schema$AppendValuesResponse> {
    const sheets = await this.getClient();
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [values],
      },
    });

    return response.data;
  }

  /**
   * Reusable function to update a specific range in a sheet.
   * Example: updateSheetRow('Users!A2:E2', ['U001', 'John Doe', 'john@example.com', 'MANAGER'])
   */
  public async updateSheetRow(range: string, values: any[]): Promise<sheets_v4.Schema$UpdateValuesResponse> {
    const sheets = await this.getClient();
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [values],
      },
    });

    return response.data;
  }

  /**
   * Reusable function to perform batch updates on the spreadsheet.
   */
  public async batchUpdate(requests: sheets_v4.Schema$Request[]): Promise<sheets_v4.Schema$BatchUpdateSpreadsheetResponse> {
    const sheets = await this.getClient();
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.spreadsheetId,
      requestBody: {
        requests,
      },
    });

    return response.data;
  }
}

export const googleSheetsService = new GoogleSheetsService();

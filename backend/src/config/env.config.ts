import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

export interface EnvConfig {
  port: number;
  frontendUrl: string;
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    serviceAccountEmail: string;
    privateKey: string;
    spreadsheetId: string;
  };
}

export const config: EnvConfig = {
  port: parseInt(process.env.PORT || '5000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    // Replace escaped newlines if private key is passed as a string with literal \n
    privateKey: process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : '',
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
  },
};

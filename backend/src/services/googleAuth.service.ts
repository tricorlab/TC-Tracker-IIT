import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { config } from '../config/env.config.js';

export interface VerifiedGoogleUser {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

export class GoogleAuthService {
  private client: OAuth2Client;
  private clientId: string;
  private isCustomClient: boolean;

  constructor(client?: OAuth2Client, clientId?: string) {
    this.clientId = clientId || config.google.clientId;
    this.client = client || new OAuth2Client(this.clientId);
    this.isCustomClient = Boolean(client);
  }

  public getClientId(): string {
    const rawId =
      this.clientId ||
      config.google.clientId ||
      process.env.GOOGLE_OAUTH_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_ID ||
      '';
    return rawId.replace(/^["']|["']$/g, '').trim();
  }

  private getClient(): OAuth2Client {
    if (this.isCustomClient && this.client) {
      return this.client;
    }
    const activeClientId = this.getClientId();
    if (!this.client || (this.client as any)._clientId !== activeClientId) {
      this.client = new OAuth2Client(activeClientId);
    }
    return this.client;
  }

  /**
   * Verify an incoming Google ID Token sent from the frontend.
   * Validates signature, audience, issuer, expiration, and email_verified claim.
   */
  public async verifyIdToken(idToken: string): Promise<VerifiedGoogleUser> {
    if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
      throw new Error('Google ID token is required.');
    }

    const activeClientId = this.getClientId();
    if (!activeClientId) {
      throw new Error('Google OAuth Client ID is not configured on the backend.');
    }

    const client = this.getClient();
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: idToken.trim(),
        audience: activeClientId,
      });
    } catch (err: any) {
      throw new Error(`Google ID token verification failed: ${err?.message || 'Invalid or expired token'}`);
    }

    const payload: TokenPayload | undefined = ticket.getPayload();

    if (!payload) {
      throw new Error('Invalid token payload: missing payload');
    }

    // Verify Issuer
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!payload.iss || !validIssuers.includes(payload.iss)) {
      throw new Error(`Invalid token issuer: ${payload.iss}`);
    }

    // Verify Email exists
    if (!payload.email) {
      throw new Error('Token does not contain an email address.');
    }

    // Verify Email Verified claim
    if (!payload.email_verified) {
      throw new Error('Google email address has not been verified by Google.');
    }

    // Normalize email: trim and lowercase
    const normalizedEmail = payload.email.trim().toLowerCase();

    return {
      googleId: payload.sub,
      email: normalizedEmail,
      name: payload.name || normalizedEmail.split('@')[0],
      picture: payload.picture,
      emailVerified: Boolean(payload.email_verified),
    };
  }
}

export const googleAuthService = new GoogleAuthService();

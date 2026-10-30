import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { config } from '../config/env.config.js';

export interface AuthenticatedUser {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  role?: string;
}

class GoogleAuthService {
  private client: OAuth2Client;

  constructor() {
    this.client = new OAuth2Client(config.google.clientId);
  }

  /**
   * Verify an incoming Google ID Token sent from the frontend.
   * Returns decoded user info if valid, throws error otherwise.
   */
  public async verifyIdToken(idToken: string): Promise<AuthenticatedUser> {
    if (!config.google.clientId) {
      throw new Error('GOOGLE_CLIENT_ID is not configured on the backend.');
    }

    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: config.google.clientId,
    });

    const payload: TokenPayload | undefined = ticket.getPayload();

    if (!payload || !payload.email) {
      throw new Error('Invalid token payload: missing email');
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture,
    };
  }
}

export const googleAuthService = new GoogleAuthService();

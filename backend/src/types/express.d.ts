import { AuthenticatedUser } from '../services/googleAuth.service.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

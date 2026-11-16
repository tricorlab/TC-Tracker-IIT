import { AuthenticatedUserContext } from '../services/userService.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUserContext;
    }
  }
}

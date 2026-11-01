import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User, UserRole, AccountStatus } from '../models/User';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// Extend Express Request to carry authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        accountStatus: AccountStatus;
        mustChangePassword?: boolean;
      };
    }
  }
}

// ─── requireAuth ─────────────────────────────────────────────────────────────

/**
 * Validates the JWT from the httpOnly cookie or Authorization header.
 * Attaches req.user on success.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Accept token from Authorization header first (tab-isolated Bearer), then httpOnly cookie
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    if (!token) {
      token = req.cookies?.plinth_token;
    }

    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Verify token
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
      return;
    }

    // Fetch user from DB — never trust role from token alone
    const user = await User.findById(payload.userId).select('+role +accountStatus +mustChangePassword');
    if (!user) {
      res.status(401).json({ success: false, message: 'User no longer exists' });
      return;
    }

    if (user.accountStatus === AccountStatus.SUSPENDED) {
      res.status(403).json({ success: false, message: 'Account has been suspended. Please contact support.' });
      return;
    }

    if (user.accountStatus === AccountStatus.REJECTED) {
      res.status(403).json({ success: false, message: 'Account application was rejected.' });
      return;
    }

    // Attach verified user to request
    req.user = {
      id: user._id.toString(),
      role: user.role,
      accountStatus: user.accountStatus,
      mustChangePassword: user.mustChangePassword ?? false,
    };

    next();
  } catch (error) {
    next(error);
  }
}

// ─── optionalAuth ────────────────────────────────────────────────────────────

/**
 * Identifies the caller when a valid Bearer token is present, but never rejects.
 * Used on public endpoints that personalise or record activity for signed-in customers.
 *
 * Only the Authorization header is honoured (not the shared httpOnly cookie) so that a
 * tab which isn't signed in stays anonymous even if another tab of the browser is.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

    const payload = jwt.verify(authHeader.slice(7), env.JWT_SECRET) as JwtPayload;
    const user = await User.findById(payload.userId).select('+role +accountStatus +mustChangePassword');
    if (
      user &&
      user.accountStatus !== AccountStatus.SUSPENDED &&
      user.accountStatus !== AccountStatus.REJECTED
    ) {
      req.user = {
        id: user._id.toString(),
        role: user.role,
        accountStatus: user.accountStatus,
        mustChangePassword: user.mustChangePassword ?? false,
      };
    }
  } catch {
    // Invalid / expired token on a public route: treat as anonymous
  }
  next();
}

// ─── requireRole ─────────────────────────────────────────────────────────────

/**
 * requireRole must be used AFTER requireAuth.
 * Checks that the authenticated user has one of the allowed roles.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource',
      });
      return;
    }

    next();
  };
}

// ─── requireActiveAccount ────────────────────────────────────────────────────

/**
 * Ensures the account status is ACTIVE (not PENDING).
 * Useful for Builder/DSA routes that require approval.
 */
export function requireActiveAccount(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  if (req.user.accountStatus !== AccountStatus.ACTIVE) {
    res.status(403).json({
      success: false,
      message: 'Your account is pending approval. Please wait for admin review.',
    });
    return;
  }

  next();
}

// ─── requirePasswordChangeCompleted ──────────────────────────────────────────

/**
 * Ensures that if the user is a BUILDER or DSA and mustChangePassword is true,
 * they cannot proceed to protected features until their password is changed.
 * Does not affect non-partner roles (Admin, Customer).
 */
export function requirePasswordChangeCompleted(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  if (
    (req.user.role === UserRole.BUILDER || req.user.role === UserRole.DSA) &&
    req.user.mustChangePassword
  ) {
    const roleName = req.user.role === UserRole.BUILDER ? 'Builder' : 'DSA';
    res.status(403).json({
      success: false,
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: `Password change is required before accessing ${roleName} resources.`,
    });
    return;
  }

  next();
}

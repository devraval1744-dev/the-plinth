import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import * as AuthService from '../services/auth.service';
import { env } from '../config/env';
import { User } from '../models/User';

// Cookie config — httpOnly prevents JS access
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/',
};

// ─── POST /api/auth/signup ────────────────────────────────────────────────────

export async function signup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map((e) => ({ field: (e as any).path, message: e.msg })),
      });
      return;
    }

    const { name, email, password, phone } = req.body;
    const result = await AuthService.signupCustomer({ name, email, password, phone });

    // Set httpOnly cookie
    res.cookie('plinth_token', result.token, COOKIE_OPTIONS);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: { user: result.user, token: result.token },
    });
  } catch (error) {
    next(error);
  }
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map((e) => ({ field: (e as any).path, message: e.msg })),
      });
      return;
    }

    const { email, password } = req.body;
    const result = await AuthService.login({ email, password });

    res.cookie('plinth_token', result.token, COOKIE_OPTIONS);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { user: result.user, token: result.token },
    });
  } catch (error) {
    next(error);
  }
}

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

export async function logout(req: Request, res: Response): Promise<void> {
  res.clearCookie('plinth_token', {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/',
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
}

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: { user: user.toSafeObject() },
    });
  } catch (error) {
    next(error);
  }
}

// ─── POST /api/auth/change-password ───────────────────────────────────────────

export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map((e) => ({ field: (e as any).path, message: e.msg })),
      });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    // req.user.id is always used — never accept userId or role from req.body
    const result = await AuthService.changePassword(req.user.id, {
      currentPassword,
      newPassword,
    });

    // Invalidate/rotate the auth session by issuing new token in cookie
    res.cookie('plinth_token', result.token, COOKIE_OPTIONS);

    res.status(200).json({
      success: true,
      message: 'Password updated successfully.',
      data: { user: result.user, token: result.token },
    });
  } catch (error) {
    next(error);
  }
}


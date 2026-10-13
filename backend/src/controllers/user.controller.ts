import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { User, UserRole } from '../models/User';
import { BuilderApplication } from '../models/BuilderApplication';
import { DSAApplication } from '../models/DSAApplication';
import * as AuthService from '../services/auth.service';
import { env } from '../config/env';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

// ─── GET /api/users/me ────────────────────────────────────────────────────────
export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    const safeUser = user.toSafeObject();

    // If BUILDER, fetch associated BuilderApplication details if present
    let builderProfile = null;
    if (user.role === UserRole.BUILDER) {
      const app = await BuilderApplication.findOne({
        $or: [{ userId: user._id }, { email: user.email.toLowerCase() }],
      }).sort({ createdAt: -1 });

      if (app) {
        builderProfile = {
          companyName: app.companyName,
          businessType: app.businessType,
          contactPerson: app.applicantName,
          yearsOfExperience: app.yearsOfExperience,
          numberOfProjects: app.numberOfProjects,
          reraRegistrationNumber: app.reraRegistrationNumber,
          officeAddress: app.officeAddress,
          city: app.city,
          state: app.state,
          website: app.website,
          description: app.description,
          applicationStatus: app.status,
          reviewedAt: app.reviewedAt,
        };
      }
    }

    // If DSA, fetch associated DSAApplication details if present
    let dsaProfile = null;
    if (user.role === UserRole.DSA) {
      const app = await DSAApplication.findOne({
        $or: [{ userId: user._id }, { email: user.email.toLowerCase() }],
      }).sort({ createdAt: -1 });

      if (app) {
        dsaProfile = {
          firmName: app.firmName,
          employmentType: app.employmentType,
          contactPerson: app.applicantName,
          yearsOfExperience: app.yearsOfExperience,
          currentOrganization: app.currentOrganization,
          areasOfOperation: app.areasOfOperation,
          bankPartnerships: app.bankPartnerships,
          address: app.address,
          city: app.city,
          state: app.state,
          description: app.description,
          applicationStatus: app.status,
          reviewedAt: app.reviewedAt,
        };
      }
    }

    res.status(200).json({
      success: true,
      data: {
        user: safeUser,
        builderProfile,
        dsaProfile,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── PATCH /api/users/me ──────────────────────────────────────────────────────
export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    // Only allow updating allowed personal fields: name, phone
    // Role, email, accountStatus, mustChangePassword, etc. are strictly forbidden from update
    const { name, phone } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (name !== undefined) {
      user.name = name.trim();
    }
    if (phone !== undefined) {
      user.phone = phone ? phone.trim() : undefined;
    }

    await user.save();

    // If builder, also keep applicantName & phone consistent on builder application if exists
    let builderProfile = null;
    if (user.role === UserRole.BUILDER) {
      const app = await BuilderApplication.findOne({
        $or: [{ userId: user._id }, { email: user.email.toLowerCase() }],
      }).sort({ createdAt: -1 });

      if (app) {
        if (name !== undefined) app.applicantName = name.trim();
        if (phone !== undefined && phone.trim()) app.phone = phone.trim();
        await app.save();

        builderProfile = {
          companyName: app.companyName,
          businessType: app.businessType,
          contactPerson: app.applicantName,
          yearsOfExperience: app.yearsOfExperience,
          numberOfProjects: app.numberOfProjects,
          reraRegistrationNumber: app.reraRegistrationNumber,
          officeAddress: app.officeAddress,
          city: app.city,
          state: app.state,
          website: app.website,
          description: app.description,
          applicationStatus: app.status,
          reviewedAt: app.reviewedAt,
        };
      }
    }

    // If DSA, also keep applicantName & phone consistent on DSA application if exists
    let dsaProfile = null;
    if (user.role === UserRole.DSA) {
      const app = await DSAApplication.findOne({
        $or: [{ userId: user._id }, { email: user.email.toLowerCase() }],
      }).sort({ createdAt: -1 });

      if (app) {
        if (name !== undefined) app.applicantName = name.trim();
        if (phone !== undefined && phone.trim()) app.phone = phone.trim();
        await app.save();

        dsaProfile = {
          firmName: app.firmName,
          employmentType: app.employmentType,
          contactPerson: app.applicantName,
          yearsOfExperience: app.yearsOfExperience,
          currentOrganization: app.currentOrganization,
          areasOfOperation: app.areasOfOperation,
          bankPartnerships: app.bankPartnerships,
          address: app.address,
          city: app.city,
          state: app.state,
          description: app.description,
          applicationStatus: app.status,
          reviewedAt: app.reviewedAt,
        };
      }
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: user.toSafeObject(),
        builderProfile,
        dsaProfile,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── PATCH /api/users/me/password ─────────────────────────────────────────────
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    const result = await AuthService.changePassword(req.user.id, {
      currentPassword,
      newPassword,
    });

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

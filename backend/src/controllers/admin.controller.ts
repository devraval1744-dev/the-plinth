import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ApplicationStatus } from '../models/BuilderApplication';
import { User } from '../models/User';
import * as AppService from '../services/application.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validationGuard(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({ field: (e as any).path, message: e.msg })),
    });
    return false;
  }
  return true;
}

function parseStatusFilter(raw: unknown): ApplicationStatus | undefined {
  const valid = Object.values(ApplicationStatus) as string[];
  if (typeof raw === 'string' && valid.includes(raw)) {
    return raw as ApplicationStatus;
  }
  return undefined;
}

// ─── GET /api/admin/users/stats ──────────────────────────────────────────────

export async function getUserStats(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const totalUsers = await User.countDocuments();
    res.status(200).json({ success: true, data: { total: totalUsers } });
  } catch (error) {
    next(error);
  }
}

// ─── GET /api/admin/applications/stats ───────────────────────────────────────

export async function getApplicationStats(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const counts = await AppService.getApplicationCounts();
    res.status(200).json({ success: true, data: counts });
  } catch (error) {
    next(error);
  }
}

// ─── GET /api/admin/applications/builders ────────────────────────────────────

export async function listBuilderApplications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const statusFilter = parseStatusFilter(req.query.status);
    const applications = await AppService.listBuilderApplications(statusFilter);
    res.status(200).json({ success: true, data: { applications, total: applications.length } });
  } catch (error) {
    next(error);
  }
}

// ─── GET /api/admin/applications/dsa ─────────────────────────────────────────

export async function listDSAApplications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const statusFilter = parseStatusFilter(req.query.status);
    const applications = await AppService.listDSAApplications(statusFilter);
    res.status(200).json({ success: true, data: { applications, total: applications.length } });
  } catch (error) {
    next(error);
  }
}

// ─── GET /api/admin/applications/builders/:id ────────────────────────────────

export async function getBuilderApplication(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const application = await AppService.getBuilderApplication(req.params.id);
    res.status(200).json({ success: true, data: { application } });
  } catch (error) {
    next(error);
  }
}

// ─── GET /api/admin/applications/dsa/:id ─────────────────────────────────────

export async function getDSAApplication(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const application = await AppService.getDSAApplication(req.params.id);
    res.status(200).json({ success: true, data: { application } });
  } catch (error) {
    next(error);
  }
}

// ─── PATCH /api/admin/applications/builders/:id/review ───────────────────────

export async function reviewBuilderApplication(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;

    const { action, adminNotes, clarificationMessage } = req.body;
    const adminUserId = req.user!.id;
    const appId = req.params.id;

    let result: object;

    switch (action) {
      case 'approve': {
        const { application, temporaryPassword } = await AppService.approveBuilderApplication(
          appId,
          { adminUserId, adminNotes }
        );
        result = {
          application,
          // Return temp password ONLY in this response — admin must relay to user securely
          // Email delivery will be added in a future phase
          temporaryPassword,
          message: `Builder account created. Temporary password: ${temporaryPassword}`,
        };
        break;
      }
      case 'reject': {
        const application = await AppService.rejectBuilderApplication(appId, {
          adminUserId,
          adminNotes,
        });
        result = { application, message: 'Application rejected' };
        break;
      }
      case 'request_clarification': {
        const application = await AppService.requestBuilderClarification(appId, {
          adminUserId,
          clarificationMessage,
        });
        result = { application, message: 'Clarification requested' };
        break;
      }
      default: {
        res.status(400).json({
          success: false,
          message: 'Invalid action. Use: approve | reject | request_clarification',
        });
        return;
      }
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ─── PATCH /api/admin/applications/dsa/:id/review ────────────────────────────

export async function reviewDSAApplication(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;

    const { action, adminNotes, clarificationMessage } = req.body;
    const adminUserId = req.user!.id;
    const appId = req.params.id;

    let result: object;

    switch (action) {
      case 'approve': {
        const { application, temporaryPassword } = await AppService.approveDSAApplication(
          appId,
          { adminUserId, adminNotes }
        );
        result = {
          application,
          temporaryPassword,
          message: `DSA account created. Temporary password: ${temporaryPassword}`,
        };
        break;
      }
      case 'reject': {
        const application = await AppService.rejectDSAApplication(appId, {
          adminUserId,
          adminNotes,
        });
        result = { application, message: 'Application rejected' };
        break;
      }
      case 'request_clarification': {
        const application = await AppService.requestDSAClarification(appId, {
          adminUserId,
          clarificationMessage,
        });
        result = { application, message: 'Clarification requested' };
        break;
      }
      default: {
        res.status(400).json({
          success: false,
          message: 'Invalid action. Use: approve | reject | request_clarification',
        });
        return;
      }
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

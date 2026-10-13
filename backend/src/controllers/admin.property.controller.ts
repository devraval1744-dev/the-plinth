import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { PropertyStatus } from '../models/Property';
import * as PropertyService from '../services/property.service';

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

// GET /api/admin/properties?status=&page=&limit=
export async function adminListProperties(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = req.query as Record<string, string>;
    const validStatuses = Object.values(PropertyStatus) as string[];
    const status = validStatuses.includes(q.status) ? (q.status as PropertyStatus) : undefined;

    const result = await PropertyService.adminListProperties({
      status,
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 20,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

// GET /api/admin/properties/stats
export async function adminPropertyStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const counts = await PropertyService.getPropertyCounts();
    res.status(200).json({ success: true, data: counts });
  } catch (err) { next(err); }
}

// GET /api/admin/properties/:id
export async function adminGetProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const property = await PropertyService.adminGetProperty(req.params.id);
    res.status(200).json({ success: true, data: { property } });
  } catch (err) { next(err); }
}

// PATCH /api/admin/properties/:id/review
export async function adminReviewProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    const { action, adminNotes, rejectionReason } = req.body;
    const validActions = ['approve', 'reject', 'request_changes'];
    if (!validActions.includes(action)) {
      res.status(400).json({ success: false, message: 'Invalid action. Use: approve | reject | request_changes' });
      return;
    }
    const property = await PropertyService.adminReviewProperty(
      req.params.id,
      req.user!.id,
      action,
      adminNotes,
      rejectionReason
    );
    res.status(200).json({ success: true, data: { property } });
  } catch (err) { next(err); }
}

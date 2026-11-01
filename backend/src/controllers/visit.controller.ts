import { Request, Response, NextFunction } from 'express';
import * as VisitService from '../services/visit.service';
import { validationGuard } from '../utils/validate';

// ─── Customer ─────────────────────────────────────────────────────────────────

// POST /api/visits
export async function createVisit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    const visit = await VisitService.createVisit(req.user!.id, req.body);
    res.status(201).json({ success: true, message: 'Site visit requested', data: { visit } });
  } catch (err) { next(err); }
}

// GET /api/visits/mine
export async function listMyVisits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const visits = await VisitService.listCustomerVisits(req.user!.id);
    res.status(200).json({ success: true, data: { visits } });
  } catch (err) { next(err); }
}

// PATCH /api/visits/:id/cancel
export async function cancelVisit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    const visit = await VisitService.cancelVisit(req.user!.id, req.params.id);
    res.status(200).json({ success: true, message: 'Site visit cancelled', data: { visit } });
  } catch (err) { next(err); }
}

// PATCH /api/visits/:id/accept-reschedule
export async function acceptReschedule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    const visit = await VisitService.acceptReschedule(req.user!.id, req.params.id);
    res.status(200).json({ success: true, message: 'New time confirmed', data: { visit } });
  } catch (err) { next(err); }
}

// ─── Builder ──────────────────────────────────────────────────────────────────

// GET /api/visits/builder?status=
export async function listBuilderVisits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const visits = await VisitService.listBuilderVisits(req.user!.id, status);
    res.status(200).json({ success: true, data: { visits } });
  } catch (err) { next(err); }
}

// GET /api/visits/builder/counts
export async function getBuilderCounts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const counts = await VisitService.getBuilderVisitCounts(req.user!.id);
    res.status(200).json({ success: true, data: counts });
  } catch (err) { next(err); }
}

// PATCH /api/visits/:id/respond
export async function respondToVisit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    const visit = await VisitService.respondToVisit(req.user!.id, req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Site visit updated', data: { visit } });
  } catch (err) { next(err); }
}

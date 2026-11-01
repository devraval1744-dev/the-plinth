import { Request, Response, NextFunction } from 'express';
import * as NotificationService from '../services/notification.service';
import { validationGuard } from '../utils/validate';

// GET /api/notifications?limit=&unread=true
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const notifications = await NotificationService.listNotifications(req.user!.id, {
      limit: Number(req.query.limit) || undefined,
      unreadOnly: req.query.unread === 'true',
    });
    const unreadCount = await NotificationService.getUnreadCount(req.user!.id);
    res.status(200).json({ success: true, data: { notifications, unreadCount } });
  } catch (err) { next(err); }
}

// GET /api/notifications/unread-count
export async function unreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await NotificationService.getUnreadCount(req.user!.id);
    res.status(200).json({ success: true, data: { count } });
  } catch (err) { next(err); }
}

// PATCH /api/notifications/read-all
export async function readAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const updated = await NotificationService.markAllRead(req.user!.id);
    res.status(200).json({ success: true, data: { updated } });
  } catch (err) { next(err); }
}

// PATCH /api/notifications/:id/read
export async function readOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    await NotificationService.markRead(req.user!.id, req.params.id);
    res.status(200).json({ success: true });
  } catch (err) { next(err); }
}

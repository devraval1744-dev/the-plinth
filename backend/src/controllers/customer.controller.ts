import { Request, Response, NextFunction } from 'express';
import * as CustomerService from '../services/customer.service';
import * as RecommendationService from '../services/recommendation.service';
import * as FavoriteService from '../services/favorite.service';
import * as ActivityService from '../services/activity.service';
import { validationGuard } from '../utils/validate';

const clampLimit = (raw: unknown, fallback: number, max: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), max) : fallback;
};

// GET /api/customer/dashboard
export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await CustomerService.getCustomerDashboard(req.user!.id);
    res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
}

// GET /api/customer/recommendations?limit=8
export async function getRecommendations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const feed = await RecommendationService.getRecommendations(req.user!.id, clampLimit(req.query.limit, 8, 24));
    res.status(200).json({ success: true, data: feed });
  } catch (err) { next(err); }
}

// GET /api/customer/recommendations/:propertyId/explain
export async function explainRecommendation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    const data = await RecommendationService.explainProperty(req.user!.id, req.params.propertyId);
    res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
}

// ─── Favorites ────────────────────────────────────────────────────────────────

// GET /api/customer/favorites
export async function listFavorites(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const properties = await FavoriteService.listFavorites(req.user!.id);
    res.status(200).json({ success: true, data: { properties, total: properties.length } });
  } catch (err) { next(err); }
}

// GET /api/customer/favorites/ids
export async function listFavoriteIds(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ids = await FavoriteService.listFavoriteIds(req.user!.id);
    res.status(200).json({ success: true, data: { ids } });
  } catch (err) { next(err); }
}

// POST /api/customer/favorites/:propertyId
export async function addFavorite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    await FavoriteService.addFavorite(req.user!.id, req.params.propertyId);
    res.status(200).json({ success: true, message: 'Property saved' });
  } catch (err) { next(err); }
}

// DELETE /api/customer/favorites/:propertyId
export async function removeFavorite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    await FavoriteService.removeFavorite(req.user!.id, req.params.propertyId);
    res.status(200).json({ success: true, message: 'Property removed from saved' });
  } catch (err) { next(err); }
}

// ─── Activity ─────────────────────────────────────────────────────────────────

// POST /api/customer/activity/search
export async function recordSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const recorded = await ActivityService.recordSearch(req.user!.id, req.body);
    res.status(200).json({ success: true, data: { recorded } });
  } catch (err) { next(err); }
}

// DELETE /api/customer/activity/history
export async function clearHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const deleted = await ActivityService.clearBrowsingHistory(req.user!.id);
    res.status(200).json({ success: true, message: 'Browsing history cleared', data: { deleted } });
  } catch (err) { next(err); }
}

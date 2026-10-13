import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import * as PropertyService from '../services/property.service';

// ─── Helper ───────────────────────────────────────────────────────────────────

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

// ─── Builder endpoints ────────────────────────────────────────────────────────

// POST /api/properties
export async function createProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    const builderId = req.user!.id;
    const property = await PropertyService.createProperty(builderId, req.body);
    res.status(201).json({ success: true, message: 'Property created as draft', data: { property } });
  } catch (err) { next(err); }
}

// GET /api/properties/mine
export async function getMyProperties(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const properties = await PropertyService.getBuilderProperties(req.user!.id);
    res.status(200).json({ success: true, data: { properties, total: properties.length } });
  } catch (err) { next(err); }
}

// GET /api/properties/:id  (builder view — sees own property regardless of status)
export async function getMyPropertyById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const property = await PropertyService.getBuilderPropertyById(req.params.id, req.user!.id);
    res.status(200).json({ success: true, data: { property } });
  } catch (err) { next(err); }
}

// PATCH /api/properties/:id
export async function updateProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    const property = await PropertyService.updateProperty(req.params.id, req.user!.id, req.body);
    res.status(200).json({ success: true, message: 'Property updated', data: { property } });
  } catch (err) { next(err); }
}

// POST /api/properties/:id/cover-image
export async function uploadCoverImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(422).json({
        success: false,
        message: 'No image file uploaded',
      });
      return;
    }
    const result = await PropertyService.uploadCoverImage(req.params.id, req.user!.id, req.file);
    res.status(200).json({
      success: true,
      message: 'Property cover image uploaded successfully',
      data: result,
    });
  } catch (err) { next(err); }
}

// POST /api/properties/:id/submit
export async function submitProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const property = await PropertyService.submitProperty(req.params.id, req.user!.id);
    res.status(200).json({ success: true, message: 'Property submitted for admin review', data: { property } });
  } catch (err) { next(err); }
}

// DELETE /api/properties/:id
export async function deleteProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await PropertyService.deleteProperty(req.params.id, req.user!.id);
    res.status(200).json({ success: true, message: 'Property deleted' });
  } catch (err) { next(err); }
}

// ─── Public discovery endpoints ───────────────────────────────────────────────

// GET /api/properties  (public — approved only)
export async function discoverProperties(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = req.query as Record<string, string>;
    const result = await PropertyService.discoverProperties({
      search: q.search,
      locality: q.locality,
      city: q.city,
      propertyType: q.propertyType,
      bhk: q.bhk,
      minPrice: q.minPrice ? Number(q.minPrice) : undefined,
      maxPrice: q.maxPrice ? Number(q.maxPrice) : undefined,
      minArea: q.minArea ? Number(q.minArea) : undefined,
      maxArea: q.maxArea ? Number(q.maxArea) : undefined,
      constructionStatus: q.constructionStatus,
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 12,
      sortBy: q.sortBy as any,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

// GET /api/properties/:id  (public — approved only)
export async function getPublicProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const property = await PropertyService.getPublicProperty(req.params.id);
    res.status(200).json({ success: true, data: { property } });
  } catch (err) { next(err); }
}

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import * as PropertyService from '../services/property.service';
import * as RecommendationService from '../services/recommendation.service';
import { recordView } from '../services/activity.service';
import { UserRole } from '../models/User';

/** A finite, non-negative number or undefined (so junk like ?minPrice=abc never reaches Mongo). */
const toNumber = (v: unknown): number | undefined => {
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

const SORT_KEYS = ['price_asc', 'price_desc', 'newest', 'area_asc'] as const;

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
    // Only plain strings are accepted — ?locality[$ne]=x style objects/arrays are ignored
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
    const q = req.query;
    const result = await PropertyService.discoverProperties({
      search: str(q.search),
      locality: str(q.locality),
      city: str(q.city),
      propertyType: str(q.propertyType),
      bhk: str(q.bhk),
      minPrice: toNumber(q.minPrice),
      maxPrice: toNumber(q.maxPrice),
      minArea: toNumber(q.minArea),
      maxArea: toNumber(q.maxArea),
      constructionStatus: str(q.constructionStatus),
      page: toNumber(q.page) || 1,
      limit: toNumber(q.limit) || 12,
      sortBy: SORT_KEYS.find((k) => k === q.sortBy),
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

// GET /api/properties/:id  (public — approved only)
// Signed-in customers get the view recorded so it can inform their recommendations.
export async function getPublicProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const property = await PropertyService.getPublicProperty(req.params.id);
    if (req.user?.role === UserRole.CUSTOMER) {
      recordView(req.user.id, String(property._id)).catch((e) =>
        console.error('[ACTIVITY] Failed to record view:', e)
      );
    }
    res.status(200).json({ success: true, data: { property } });
  } catch (err) { next(err); }
}

// GET /api/properties/suggest?q=  (public typeahead)
export async function suggest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const data = await PropertyService.suggestSearch(q);
    res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
}

// GET /api/properties/trending?limit=
export async function trending(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = Math.min(24, Math.max(1, toNumber(req.query.limit) || 8));
    const data = await RecommendationService.getTrendingProperties(limit);
    res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
}

// GET /api/properties/localities  (live per-locality inventory)
export async function localityStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const localities = await PropertyService.getLocalityStats();
    res.status(200).json({ success: true, data: { localities } });
  } catch (err) { next(err); }
}

// GET /api/properties/compare?ids=a,b,c
export async function compare(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const properties = await PropertyService.getPropertiesForCompare(ids);
    res.status(200).json({ success: true, data: { properties } });
  } catch (err) { next(err); }
}

// GET /api/properties/:id/similar?limit=
export async function similar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = Math.min(12, Math.max(1, toNumber(req.query.limit) || 6));
    const properties = await PropertyService.getSimilarProperties(req.params.id, limit);
    res.status(200).json({ success: true, data: { properties } });
  } catch (err) { next(err); }
}

// GET /api/properties/:id/nearby-amenities (public for approved properties, respects snapshot)
export async function getNearbyAmenities(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Confirm property is visible to public under existing approval & snapshot rules
    const property = await PropertyService.getPublicProperty(req.params.id);

    // 2. Check if coordinates are present on the visible property record
    const lat = property.latitude;
    const lng = property.longitude;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      res.status(200).json({
        success: true,
        data: {
          hasCoordinates: false,
          amenities: [],
          counts: { education: 0, healthcare: 0, shopping: 0, transit: 0, total: 0 },
          message: 'Location coordinates not specified for this property yet.',
        },
      });
      return;
    }

    // 3. Fetch nearby amenities using Overpass API with caching and distance calculation
    const radiusKm = req.query.radius ? Number(req.query.radius) : 3;
    const { fetchNearbyAmenities } = await import('../services/location.service');
    const amenitiesData = await fetchNearbyAmenities(lat, lng, radiusKm, property._id?.toString());

    res.status(200).json({
      success: true,
      data: {
        hasCoordinates: true,
        ...amenitiesData,
      },
    });
  } catch (err) { next(err); }
}


import { Router } from 'express';
import { body } from 'express-validator';
import multer from 'multer';
import * as PropController from '../controllers/property.controller';
import { requireAuth, requireRole, requirePasswordChangeCompleted } from '../middleware/auth.middleware';
import { UserRole } from '../models/User';
import {
  ALLOWED_PROPERTY_IMAGE_MIMETYPES,
  MAX_PROPERTY_IMAGE_SIZE_BYTES,
} from '../utils/storage';

const router = Router();

// ─── Multer for property cover image ──────────────────────────────────────────

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROPERTY_IMAGE_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_PROPERTY_IMAGE_MIMETYPES[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported image type: ${file.mimetype}. Allowed types: JPG, JPEG, PNG, WEBP.`));
    }
  },
});

// ─── Shared validation ────────────────────────────────────────────────────────

const PROPERTY_TYPES = [
  'Apartment', 'Villa', 'Bungalow', 'Penthouse', 'Studio',
  'Plot', 'Commercial', 'Office', 'Shop', 'Warehouse',
];
const CONSTRUCTION_STATUSES = [
  'Under Construction', 'Ready to Move', 'New Launch', 'Completed',
];

const propertyBodyValidation = [
  body('title').trim().notEmpty().withMessage('Title is required')
    .isLength({ min: 5, max: 200 }).withMessage('Title must be 5–200 characters'),
  body('projectName').trim().notEmpty().withMessage('Project name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Project name must be 2–200 characters'),
  body('description').trim().notEmpty().withMessage('Description is required')
    .isLength({ min: 50, max: 5000 }).withMessage('Description must be 50–5000 characters'),
  body('propertyType').trim().notEmpty().withMessage('Property type is required')
    .isIn(PROPERTY_TYPES).withMessage('Invalid property type'),
  body('locality').trim().notEmpty().withMessage('Locality is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('address').trim().notEmpty().withMessage('Address is required')
    .isLength({ max: 500 }).withMessage('Address too long'),
  body('minPrice').notEmpty().withMessage('Minimum price is required')
    .isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('maxPrice').notEmpty().withMessage('Maximum price is required')
    .isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('minArea').notEmpty().withMessage('Minimum area is required')
    .isFloat({ min: 0 }).withMessage('Area must be a positive number'),
  body('maxArea').notEmpty().withMessage('Maximum area is required')
    .isFloat({ min: 0 }).withMessage('Area must be a positive number'),
  body('totalUnits').notEmpty().withMessage('Total units is required')
    .isInt({ min: 1 }).withMessage('Must have at least 1 unit'),
  body('availableUnits').notEmpty().withMessage('Available units is required')
    .isInt({ min: 0 }).withMessage('Cannot be negative'),
  body('constructionStatus').trim().notEmpty().withMessage('Construction status is required')
    .isIn(CONSTRUCTION_STATUSES).withMessage('Invalid construction status'),
  body('bhkConfigurations').optional().isArray().withMessage('BHK configurations must be an array'),
  body('amenities').optional().isArray().withMessage('Amenities must be an array'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
];

// Partial validation for updates (all fields optional)
const propertyUpdateValidation = [
  body('title').optional().trim()
    .isLength({ min: 5, max: 200 }).withMessage('Title must be 5–200 characters'),
  body('projectName').optional().trim()
    .isLength({ min: 2, max: 200 }).withMessage('Project name must be 2–200 characters'),
  body('description').optional().trim()
    .isLength({ min: 50, max: 5000 }).withMessage('Description must be 50–5000 characters'),
  body('propertyType').optional().trim()
    .isIn(PROPERTY_TYPES).withMessage('Invalid property type'),
  body('constructionStatus').optional().trim()
    .isIn(CONSTRUCTION_STATUSES).withMessage('Invalid construction status'),
  body('minPrice').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('maxPrice').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('minArea').optional().isFloat({ min: 0 }).withMessage('Area must be a positive number'),
  body('maxArea').optional().isFloat({ min: 0 }).withMessage('Area must be a positive number'),
  body('totalUnits').optional().isInt({ min: 1 }).withMessage('Must have at least 1 unit'),
  body('availableUnits').optional().isInt({ min: 0 }).withMessage('Cannot be negative'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
];

// ─── Public routes (no auth) ──────────────────────────────────────────────────
// These must come BEFORE the auth middleware block

router.get('/', PropController.discoverProperties);

// ─── Builder routes (requireAuth + BUILDER role) ──────────────────────────────
// Specific named paths must be declared before /:id to avoid conflicts

router.post(
  '/',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  propertyBodyValidation,
  PropController.createProperty
);

router.get(
  '/mine',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  PropController.getMyProperties
);

router.patch(
  '/:id',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  propertyUpdateValidation,
  PropController.updateProperty
);

router.post(
  '/:id/cover-image',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  imageUpload.single('coverImage'),
  PropController.uploadCoverImage
);

router.post(
  '/:id/submit',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  PropController.submitProperty
);

router.delete(
  '/:id',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  PropController.deleteProperty
);

// ─── GET /:id — public for APPROVED, authenticated builder for own property ───
// The controller logic differentiates via query param `?view=builder`
router.get('/:id', async (req, res, next) => {
  if (req.query.view === 'builder') {
    // Authenticated builder wants to see their own draft/etc property
    requireAuth(req, res, async () => {
      requireRole(UserRole.BUILDER)(req, res, () => {
        requirePasswordChangeCompleted(req, res, () => {
          PropController.getMyPropertyById(req, res, next);
        });
      });
    });
  } else {
    // Public - only APPROVED
    PropController.getPublicProperty(req, res, next);
  }
});

export default router;

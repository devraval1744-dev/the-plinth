import { Router } from 'express';
import { body } from 'express-validator';
import multer from 'multer';
import * as BpController from '../controllers/blueprint.controller';
import * as AnalysisController from '../controllers/analysis.controller';
import { requireAuth, requireRole, requirePasswordChangeCompleted } from '../middleware/auth.middleware';
import { UserRole } from '../models/User';
import { BlueprintLevel, BlueprintType } from '../models/Blueprint';
import { MAX_BLUEPRINT_SIZE_BYTES } from '../utils/storage';

// ─── Multer: memory storage (we write to disk ourselves in storage service) ───

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BLUEPRINT_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    const allowed = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ─── Validation ───────────────────────────────────────────────────────────────

const createValidation = [
  body('level')
    .trim().notEmpty().withMessage('Blueprint level is required')
    .isIn(Object.values(BlueprintLevel)).withMessage('Invalid blueprint level (PROPERTY or UNIT)'),
  body('blueprintType')
    .trim().notEmpty().withMessage('Blueprint type is required')
    .isIn(Object.values(BlueprintType)).withMessage('Invalid blueprint type'),
  body('title')
    .trim().notEmpty().withMessage('Blueprint title is required')
    .isLength({ max: 200 }).withMessage('Title must not exceed 200 characters'),
  body('unitType').optional().trim(),
  body('unitLabel').optional().trim(),
  body('description').optional().trim()
    .isLength({ max: 1000 }).withMessage('Description must not exceed 1000 characters'),
];

const updateValidation = [
  body('title').optional().trim().isLength({ max: 200 }).withMessage('Title too long'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description too long'),
  body('blueprintType').optional().trim()
    .isIn(Object.values(BlueprintType)).withMessage('Invalid blueprint type'),
];

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router({ mergeParams: true });
// mergeParams allows :propertyId from parent router to flow in

// ── Public routes (must come before auth-guarded routes) ──────────────────────

// GET /api/properties/:propertyId/blueprints/public
router.get('/public', BpController.getPublicBlueprints);

// GET /api/properties/:propertyId/blueprints/public/:blueprintId
router.get('/public/:blueprintId', BpController.getPublicBlueprintById);

// ── Builder routes ────────────────────────────────────────────────────────────

// POST /api/properties/:propertyId/blueprints
router.post(
  '/',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  upload.single('file'),
  createValidation,
  BpController.createBlueprint
);

// GET /api/properties/:propertyId/blueprints
router.get(
  '/',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  BpController.getPropertyBlueprints
);

// GET /api/properties/:propertyId/blueprints/:blueprintId
router.get(
  '/:blueprintId',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  BpController.getBlueprintById
);

// POST /api/properties/:propertyId/blueprints/:blueprintId/replace
router.post(
  '/:blueprintId/replace',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  upload.single('file'),
  BpController.replaceBlueprint
);

// PATCH /api/properties/:propertyId/blueprints/:blueprintId
router.patch(
  '/:blueprintId',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  updateValidation,
  BpController.updateBlueprintMetadata
);

// POST /api/properties/:propertyId/blueprints/:blueprintId/archive
router.post(
  '/:blueprintId/archive',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  BpController.archiveBlueprint
);

// ─── Analysis routes ──────────────────────────────────────────────────────────

// Public — GET /api/properties/:propertyId/blueprints/:blueprintId/3d
router.get('/:blueprintId/3d', AnalysisController.getPublic3D);

// Builder — POST /api/properties/:propertyId/blueprints/:blueprintId/analyze
router.post(
  '/:blueprintId/analyze',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  AnalysisController.triggerAnalysis,
);

// Builder — GET /api/properties/:propertyId/blueprints/:blueprintId/analysis
router.get(
  '/:blueprintId/analysis',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  AnalysisController.getAnalysis,
);

// Builder — GET /api/properties/:propertyId/blueprints/:blueprintId/analysis/status
router.get(
  '/:blueprintId/analysis/status',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  AnalysisController.getAnalysisStatus,
);

// Builder — POST retry
router.post(
  '/:blueprintId/analysis/retry',
  requireAuth,
  requireRole(UserRole.BUILDER),
  requirePasswordChangeCompleted,
  AnalysisController.retryAnalysis,
);

export default router;

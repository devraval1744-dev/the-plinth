import { Router } from 'express';
import { body } from 'express-validator';
import * as AdminPropController from '../controllers/admin.property.controller';
import * as BpController from '../controllers/blueprint.controller';
import * as AnalysisController from '../controllers/analysis.controller';

const router = Router();
// Note: requireAuth + requireRole(ADMIN) applied at index.ts level

const reviewValidation = [
  body('action')
    .trim().notEmpty().withMessage('Action is required')
    .isIn(['approve', 'reject', 'request_changes'])
    .withMessage('Action must be: approve | reject | request_changes'),
  body('adminNotes').optional().trim()
    .isLength({ max: 2000 }).withMessage('Admin notes must not exceed 2000 characters'),
  body('rejectionReason').optional().trim()
    .isLength({ max: 2000 }).withMessage('Rejection reason must not exceed 2000 characters'),
];

// GET /api/admin/properties/stats
router.get('/stats', AdminPropController.adminPropertyStats);

// GET /api/admin/properties?status=&page=&limit=
router.get('/', AdminPropController.adminListProperties);

// GET /api/admin/properties/:id
router.get('/:id', AdminPropController.adminGetProperty);

// PATCH /api/admin/properties/:id/review
router.patch('/:id/review', reviewValidation, AdminPropController.adminReviewProperty);

// GET /api/admin/properties/:propertyId/blueprints
router.get('/:propertyId/blueprints', BpController.getAdminPropertyBlueprints);

// GET /api/admin/properties/:propertyId/blueprints/:blueprintId/analysis
router.get('/:propertyId/blueprints/:blueprintId/analysis', AnalysisController.adminGetAnalysis);

export default router;

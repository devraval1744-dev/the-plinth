import { Router } from 'express';
import { body } from 'express-validator';
import * as AdminController from '../controllers/admin.controller';

const router = Router();
// Note: requireAuth + requireRole(ADMIN) are applied at the index.ts level,
// before this router is mounted. No need to repeat them here.

// ─── Validation ───────────────────────────────────────────────────────────────

const reviewValidation = [
  body('action')
    .trim()
    .notEmpty().withMessage('Action is required')
    .isIn(['approve', 'reject', 'request_clarification'])
    .withMessage('Action must be: approve | reject | request_clarification'),
  body('adminNotes')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Admin notes must not exceed 1000 characters'),
  body('clarificationMessage')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Clarification message must not exceed 2000 characters'),
];

// ─── User stats ───────────────────────────────────────────────────────────────

// GET /api/admin/users/stats
router.get('/users/stats', AdminController.getUserStats);

// ─── Application stats ────────────────────────────────────────────────────────

// GET /api/admin/applications/stats
router.get('/applications/stats', AdminController.getApplicationStats);

// ─── Builder applications ─────────────────────────────────────────────────────

// GET  /api/admin/applications/builders          ?status=PENDING|APPROVED|REJECTED|CLARIFICATION_REQUESTED
router.get('/applications/builders', AdminController.listBuilderApplications);

// GET  /api/admin/applications/builders/:id
router.get('/applications/builders/:id', AdminController.getBuilderApplication);

// PATCH /api/admin/applications/builders/:id/review
router.patch(
  '/applications/builders/:id/review',
  reviewValidation,
  AdminController.reviewBuilderApplication
);

// ─── DSA applications ─────────────────────────────────────────────────────────

// GET  /api/admin/applications/dsa               ?status=PENDING|...
router.get('/applications/dsa', AdminController.listDSAApplications);

// GET  /api/admin/applications/dsa/:id
router.get('/applications/dsa/:id', AdminController.getDSAApplication);

// PATCH /api/admin/applications/dsa/:id/review
router.patch(
  '/applications/dsa/:id/review',
  reviewValidation,
  AdminController.reviewDSAApplication
);

export default router;

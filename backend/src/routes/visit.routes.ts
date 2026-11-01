import { Router } from 'express';
import { body, param } from 'express-validator';
import rateLimit from 'express-rate-limit';
import * as VisitController from '../controllers/visit.controller';
import { requireAuth, requireRole, requirePasswordChangeCompleted } from '../middleware/auth.middleware';
import { UserRole } from '../models/User';
import { VisitSlot } from '../models/SiteVisit';

const router = Router();

const idParam = param('id').isMongoId().withMessage('Invalid visit ID');

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many visit requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const createValidation = [
  body('propertyId').isMongoId().withMessage('A valid property is required'),
  body('visitDate').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Visit date must be in YYYY-MM-DD format'),
  body('timeSlot').isIn(Object.values(VisitSlot)).withMessage('Please choose a valid time slot'),
  body('visitors').optional().isInt({ min: 1, max: 10 }).withMessage('Visitors must be between 1 and 10').toInt(),
  body('contactName').trim().notEmpty().withMessage('Contact name is required')
    .isLength({ max: 100 }).withMessage('Name is too long'),
  body('contactPhone').trim().matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid 10-digit Indian mobile number'),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Notes must be under 500 characters'),
];

const respondValidation = [
  idParam,
  body('action').isIn(['confirm', 'decline', 'reschedule', 'complete']).withMessage('Invalid action'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Note must be under 500 characters'),
  body('newDate').optional({ values: 'falsy' }).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('New date must be in YYYY-MM-DD format'),
  body('newSlot').optional({ values: 'falsy' }).isIn(Object.values(VisitSlot)).withMessage('Invalid time slot'),
];

// ─── Customer ─────────────────────────────────────────────────────────────────

router.post('/', requireAuth, requireRole(UserRole.CUSTOMER), createLimiter, createValidation, VisitController.createVisit);
router.get('/mine', requireAuth, requireRole(UserRole.CUSTOMER), VisitController.listMyVisits);
router.patch('/:id/cancel', requireAuth, requireRole(UserRole.CUSTOMER), idParam, VisitController.cancelVisit);
router.patch(
  '/:id/accept-reschedule',
  requireAuth,
  requireRole(UserRole.CUSTOMER),
  idParam,
  VisitController.acceptReschedule
);

// ─── Builder ──────────────────────────────────────────────────────────────────

const builderOnly = [requireAuth, requireRole(UserRole.BUILDER), requirePasswordChangeCompleted];

router.get('/builder', ...builderOnly, VisitController.listBuilderVisits);
router.get('/builder/counts', ...builderOnly, VisitController.getBuilderCounts);
router.patch('/:id/respond', ...builderOnly, respondValidation, VisitController.respondToVisit);

export default router;

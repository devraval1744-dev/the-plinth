import { Router } from 'express';
import { body, param } from 'express-validator';
import rateLimit from 'express-rate-limit';
import * as LoanController from '../controllers/loan.controller';
import { requireAuth, requireRole, requirePasswordChangeCompleted } from '../middleware/auth.middleware';
import { UserRole } from '../models/User';
import { DSA_SETTABLE_STATUSES } from '../models/LoanRequest';

const router = Router();

const idParam = param('id').isMongoId().withMessage('Invalid request ID');

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const createValidation = [
  body('propertyId').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid property'),
  body('contactName').trim().notEmpty().withMessage('Contact name is required')
    .isLength({ max: 100 }).withMessage('Name is too long'),
  body('contactPhone').trim().matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid 10-digit Indian mobile number'),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Notes must be under 500 characters'),
  body('consent').custom((v) => v === true).withMessage('Your consent to share these details with a DSA partner is required'),
];

// ─── Customer ─────────────────────────────────────────────────────────────────

router.post('/', requireAuth, requireRole(UserRole.CUSTOMER), createLimiter, createValidation, LoanController.createLoan);
router.get('/mine', requireAuth, requireRole(UserRole.CUSTOMER), LoanController.listMyLoans);
router.patch('/:id/cancel', requireAuth, requireRole(UserRole.CUSTOMER), idParam, LoanController.cancelLoan);

// ─── DSA ──────────────────────────────────────────────────────────────────────

const dsaOnly = [requireAuth, requireRole(UserRole.DSA), requirePasswordChangeCompleted];

router.get('/leads', ...dsaOnly, LoanController.listLeads);
router.get('/leads/counts', ...dsaOnly, LoanController.getLeadCounts);
router.patch(
  '/:id/status',
  ...dsaOnly,
  idParam,
  body('status').isIn(DSA_SETTABLE_STATUSES).withMessage('Invalid status'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Note must be under 500 characters'),
  LoanController.updateLeadStatus
);

export default router;

import { Router } from 'express';
import { body } from 'express-validator';
import * as UserController from '../controllers/user.controller';
import { requireAuth, requirePasswordChangeCompleted } from '../middleware/auth.middleware';

const router = Router();

// ─── Validation ───────────────────────────────────────────────────────────────

const updateProfileValidation = [
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Name cannot be empty')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid 10-digit Indian mobile number'),
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
];

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/users/me — Return authenticated user's profile
router.get('/me', requireAuth, UserController.getProfile);

// PATCH /api/users/me — Update profile fields (name, phone)
router.patch('/me', requireAuth, requirePasswordChangeCompleted, updateProfileValidation, UserController.updateProfile);

// PATCH /api/users/me/password — Change password
router.patch('/me/password', requireAuth, changePasswordValidation, UserController.changePassword);

export default router;

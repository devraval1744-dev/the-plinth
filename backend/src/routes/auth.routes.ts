import { Router } from 'express';
import { body } from 'express-validator';
import * as AuthController from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// ─── Validation rules ─────────────────────────────────────────────────────────

const signupValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
  body('phone')
    .optional()
    .trim()
    .matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid 10-digit Indian mobile number'),
];

const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
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

// POST /api/auth/signup — Customer registration only
router.post('/signup', signupValidation, AuthController.signup);

// POST /api/auth/login — Common login for all roles
router.post('/login', loginValidation, AuthController.login);

// POST /api/auth/logout
router.post('/logout', AuthController.logout);

// GET /api/auth/me — Fetch current user (requires auth)
router.get('/me', requireAuth, AuthController.getMe);

// POST /api/auth/change-password — Authenticated user changes password
router.post('/change-password', requireAuth, changePasswordValidation, AuthController.changePassword);

export default router;

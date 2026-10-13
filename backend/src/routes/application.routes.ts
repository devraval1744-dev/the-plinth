import { Router } from 'express';
import { body } from 'express-validator';
import * as AppController from '../controllers/application.controller';

const router = Router();

// ─── Shared validation helpers ────────────────────────────────────────────────

const commonApplicantFields = [
  body('applicantName')
    .trim()
    .notEmpty().withMessage('Applicant name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid 10-digit Indian mobile number'),
];

// ─── Builder application validation ──────────────────────────────────────────

const builderValidation = [
  ...commonApplicantFields,
  body('companyName')
    .trim()
    .notEmpty().withMessage('Company / builder name is required')
    .isLength({ max: 200 }).withMessage('Company name must not exceed 200 characters'),
  body('businessType')
    .trim()
    .notEmpty().withMessage('Business type is required')
    .isIn(['Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship', 'Other'])
    .withMessage('Invalid business type'),
  body('yearsOfExperience')
    .notEmpty().withMessage('Years of experience is required')
    .isInt({ min: 0, max: 100 }).withMessage('Please enter a valid value (0–100)'),
  body('numberOfProjects')
    .notEmpty().withMessage('Number of completed projects is required')
    .isInt({ min: 0 }).withMessage('Cannot be negative'),
  body('reraRegistrationNumber')
    .optional()
    .trim(),
  body('officeAddress')
    .trim()
    .notEmpty().withMessage('Office address is required')
    .isLength({ max: 500 }).withMessage('Address too long'),
  body('city')
    .trim()
    .notEmpty().withMessage('City is required'),
  body('state')
    .trim()
    .notEmpty().withMessage('State is required'),
  body('website')
    .optional()
    .trim(),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 50, max: 2000 })
    .withMessage('Description must be 50–2000 characters'),
];

// ─── DSA application validation ───────────────────────────────────────────────

const dsaValidation = [
  ...commonApplicantFields,
  body('firmName')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Firm name must not exceed 200 characters'),
  body('employmentType')
    .trim()
    .notEmpty().withMessage('Employment type is required')
    .isIn(['Self-Employed', 'Employed', 'Freelance'])
    .withMessage('Invalid employment type'),
  body('yearsOfExperience')
    .notEmpty().withMessage('Years of experience is required')
    .isInt({ min: 0, max: 60 }).withMessage('Please enter a valid value (0–60)'),
  body('currentOrganization').optional().trim(),
  body('areasOfOperation').optional(),
  body('bankPartnerships')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Too long'),
  body('address')
    .trim()
    .notEmpty().withMessage('Address is required')
    .isLength({ max: 500 }).withMessage('Address too long'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 50, max: 2000 })
    .withMessage('Description must be 50–2000 characters'),
];

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/applications/builder — Public, no auth required
router.post('/builder', builderValidation, AppController.submitBuilderApplication);

// POST /api/applications/dsa — Public, no auth required
router.post('/dsa', dsaValidation, AppController.submitDSAApplication);

export default router;

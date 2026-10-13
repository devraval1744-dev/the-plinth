import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import applicationRoutes from './application.routes';
import adminRoutes from './admin.routes';
import adminPropertyRoutes from './admin.property.routes';
import propertyRoutes from './property.routes';
import blueprintRoutes from './blueprint.routes';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { UserRole } from '../models/User';

const router = Router();

// ─── Health check ─────────────────────────────────────────────────────────────

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Plinth API is running',
    timestamp: new Date().toISOString(),
  });
});

// ─── Auth (public & me) ───────────────────────────────────────────────────────

router.use('/auth', authRoutes);

// ─── Users & Profile (authenticated) ──────────────────────────────────────────

router.use('/users', userRoutes);

// ─── Application submission (public) ─────────────────────────────────────────

router.use('/applications', applicationRoutes);

// ─── Properties (mixed auth — see property.routes.ts) ────────────────────────

router.use('/properties', propertyRoutes);

// ─── Blueprints — nested under properties ────────────────────────────────────
// Mounted with mergeParams so :propertyId flows through

router.use('/properties/:propertyId/blueprints', blueprintRoutes);

// ─── Admin — applications (requireAuth + ADMIN) ───────────────────────────────

router.use(
  '/admin',
  requireAuth,
  requireRole(UserRole.ADMIN),
  adminRoutes
);

// ─── Admin — properties (requireAuth + ADMIN) ────────────────────────────────

router.use(
  '/admin/properties',
  requireAuth,
  requireRole(UserRole.ADMIN),
  adminPropertyRoutes
);

export default router;

import { Router } from 'express';
import { param } from 'express-validator';
import * as CustomerController from '../controllers/customer.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { UserRole } from '../models/User';

const router = Router();

// Everything under /api/customer is for signed-in customers only
router.use(requireAuth, requireRole(UserRole.CUSTOMER));

const propertyIdParam = param('propertyId').isMongoId().withMessage('Invalid property ID');

// Home dashboard + personalisation
router.get('/dashboard', CustomerController.getDashboard);
router.get('/recommendations', CustomerController.getRecommendations);
router.get(
  '/recommendations/:propertyId/explain',
  propertyIdParam,
  CustomerController.explainRecommendation
);

// Saved properties
router.get('/favorites', CustomerController.listFavorites);
router.get('/favorites/ids', CustomerController.listFavoriteIds);
router.post('/favorites/:propertyId', propertyIdParam, CustomerController.addFavorite);
router.delete('/favorites/:propertyId', propertyIdParam, CustomerController.removeFavorite);

// Behavioural activity (feeds recommendations)
router.post('/activity/search', CustomerController.recordSearch);
router.delete('/activity/history', CustomerController.clearHistory);

export default router;

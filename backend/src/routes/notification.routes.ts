import { Router } from 'express';
import { param } from 'express-validator';
import * as NotificationController from '../controllers/notification.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Notifications belong to the signed-in user, whatever their role
router.use(requireAuth);

router.get('/', NotificationController.list);
router.get('/unread-count', NotificationController.unreadCount);
router.patch('/read-all', NotificationController.readAll);
router.patch('/:id/read', param('id').isMongoId().withMessage('Invalid notification ID'), NotificationController.readOne);

export default router;

import { Router } from 'express';
import { authGuard, requirePermission, requireTenant } from '../../middlewares/auth.js';
import * as service from './service.js';

const router = Router();

router.use(authGuard, requireTenant);

router.post('/events', requirePermission('chat.use'), service.recordEvent);
router.get('/history', requirePermission('chat.use'), service.listHistory);

export default router;

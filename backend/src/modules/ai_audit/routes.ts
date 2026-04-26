import { Router } from 'express';
import {
  authGuard,
  requirePermission,
  requireTenantFeatureAccess,
  requireTenantUser,
  requireTenantWriteAccess,
} from '@backend/middlewares/auth.js';
import * as service from '@backend/modules/ai_audit/service.js';

const router = Router();

router.use(authGuard, requireTenantUser, requireTenantFeatureAccess('chat'));

router.post('/events', requirePermission('chat.use'), requireTenantWriteAccess({ feature: 'chat' }), service.recordEvent);
router.get('/history', requirePermission('chat.use'), service.listHistory);

export default router;

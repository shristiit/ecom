import { Router } from 'express';
import {
  authGuard,
  requirePermission,
  requireTenantFeatureAccess,
  requireTenantUser,
  requireTenantWriteAccess,
} from '@backend/middlewares/auth.js';
import { idempotencyGuard } from '@backend/middlewares/idempotency.js';
import * as service from '@backend/modules/ai_governance/service.js';

const router = Router();

router.use(authGuard, requireTenantUser, requireTenantFeatureAccess('ai_governance'));

const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

router.post('/evaluate', requirePermission('chat.use'), requireTenantWriteAccess({ feature: 'ai_governance' }), idem, service.evaluateAction);
router.post('/requests', requirePermission('chat.use'), requireTenantWriteAccess({ feature: 'ai_governance' }), idem, service.createApprovalRequest);
router.patch('/requests/:id', requirePermission('chat.use'), requireTenantWriteAccess({ feature: 'ai_governance' }), idem, service.updateApprovalRequest);
router.get('/requests/:id', requirePermission('chat.use'), service.getApprovalRequest);
router.get('/approvals', requirePermission('chat.approve'), service.listApprovals);
router.post('/approvals/:id/decision', requirePermission('chat.approve'), requireTenantWriteAccess({ feature: 'ai_governance' }), idem, service.decideApproval);

export default router;

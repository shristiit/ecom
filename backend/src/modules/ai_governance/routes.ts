import { Router } from 'express';
import { authGuard, requirePermission, requireTenant } from '../../middlewares/auth.js';
import { idempotencyGuard } from '../../middlewares/idempotency.js';
import * as service from './service.js';

const router = Router();

router.use(authGuard, requireTenant);

const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

router.post('/evaluate', requirePermission('chat.use'), idem, service.evaluateAction);
router.post('/requests', requirePermission('chat.use'), idem, service.createApprovalRequest);
router.get('/requests/:id', requirePermission('chat.use'), service.getApprovalRequest);
router.get('/approvals', requirePermission('chat.approve'), service.listApprovals);
router.post('/approvals/:id/decision', requirePermission('chat.approve'), idem, service.decideApproval);

export default router;

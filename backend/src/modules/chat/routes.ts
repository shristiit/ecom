import { Router } from 'express';
import {
  authGuard,
  requirePermission,
  requireTenantFeatureAccess,
  requireTenantUser,
  requireTenantWriteAccess,
} from '@backend/middlewares/auth.js';
import { idempotencyGuard } from '@backend/middlewares/idempotency.js';
import * as ctrl from '@backend/modules/chat/service.js';

const r = Router();

r.use(authGuard, requireTenantUser, requireTenantFeatureAccess('chat'));
const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

r.get('/threads', requirePermission('chat.use'), ctrl.listThreads);
r.get('/approvals', requirePermission('chat.approve'), ctrl.listApprovals);
r.get('/history', requirePermission('chat.use'), ctrl.listHistory);
r.post('/respond', requirePermission('chat.use'), requireTenantWriteAccess({ feature: 'chat' }), idem, ctrl.respond);
r.post('/navigate', requirePermission('chat.use'), requireTenantWriteAccess({ feature: 'chat' }), idem, ctrl.navigate);
r.post('/interpret', requirePermission('chat.use'), requireTenantWriteAccess({ feature: 'chat' }), idem, ctrl.interpret);
r.post('/confirm', requirePermission('chat.use'), requireTenantWriteAccess({ feature: 'chat' }), idem, ctrl.confirm);
r.post('/approve', requirePermission('chat.approve'), requireTenantWriteAccess({ feature: 'chat' }), idem, ctrl.approve);
r.post('/execute', requirePermission('chat.use'), requireTenantWriteAccess({ feature: 'chat' }), idem, ctrl.execute);
r.get('/thread/:id', requirePermission('chat.use'), ctrl.thread);

export default r;

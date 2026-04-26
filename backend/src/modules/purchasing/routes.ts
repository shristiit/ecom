import { Router } from 'express';
import {
  authGuard,
  requirePermission,
  requireTenantFeatureAccess,
  requireTenantUser,
  requireTenantWriteAccess,
} from '@backend/middlewares/auth.js';
import { idempotencyGuard } from '@backend/middlewares/idempotency.js';
import * as ctrl from '@backend/modules/purchasing/service.js';

const r = Router();

r.use(authGuard, requireTenantUser, requireTenantFeatureAccess('purchasing'));
const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

r.get('/po', requirePermission('purchasing.read'), ctrl.listPOs);
r.get('/po/:id', requirePermission('purchasing.read'), ctrl.getPO);
r.post('/po', requirePermission('purchasing.write'), requireTenantWriteAccess({ feature: 'purchasing' }), idem, ctrl.createPO);
r.patch('/po/:id', requirePermission('purchasing.write'), requireTenantWriteAccess({ feature: 'purchasing' }), idem, ctrl.updatePO);
r.post('/po/:id/receive', requirePermission('purchasing.write'), requireTenantWriteAccess({ feature: 'purchasing' }), idem, ctrl.receivePO);
r.post('/po/:id/close', requirePermission('purchasing.write'), requireTenantWriteAccess({ feature: 'purchasing' }), idem, ctrl.closePO);

export default r;

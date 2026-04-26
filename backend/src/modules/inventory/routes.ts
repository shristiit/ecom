import { Router } from 'express';
import {
  authGuard,
  requirePermission,
  requireTenantFeatureAccess,
  requireTenantUser,
  requireTenantWriteAccess,
} from '@backend/middlewares/auth.js';
import { idempotencyGuard } from '@backend/middlewares/idempotency.js';
import * as ctrl from '@backend/modules/inventory/service.js';

const r = Router();

r.use(authGuard, requireTenantUser, requireTenantFeatureAccess('inventory'));
const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

r.get('/stock-on-hand', requirePermission('inventory.read'), ctrl.stockOnHand);
r.get('/movements', requirePermission('inventory.read'), ctrl.movements);
r.get('/receipts', requirePermission('inventory.read'), ctrl.listReceipts);

r.post('/receive', requirePermission('inventory.write'), requireTenantWriteAccess({ feature: 'inventory' }), idem, ctrl.receive);
r.post('/transfer', requirePermission('inventory.write'), requireTenantWriteAccess({ feature: 'inventory' }), idem, ctrl.transfer);
r.post('/adjust', requirePermission('inventory.write'), requireTenantWriteAccess({ feature: 'inventory' }), idem, ctrl.adjust);
r.post('/write-off', requirePermission('inventory.write'), requireTenantWriteAccess({ feature: 'inventory' }), idem, ctrl.writeOff);
r.post('/cycle-count', requirePermission('inventory.write'), requireTenantWriteAccess({ feature: 'inventory' }), idem, ctrl.cycleCount);

export default r;

import { Router } from 'express';
import {
  authGuard,
  requirePermission,
  requireTenantFeatureAccess,
  requireTenantUser,
  requireTenantWriteAccess,
} from '@backend/middlewares/auth.js';
import { idempotencyGuard } from '@backend/middlewares/idempotency.js';
import * as ctrl from '@backend/modules/sales/service.js';

const r = Router();

r.use(authGuard, requireTenantUser, requireTenantFeatureAccess('sales'));
const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

r.get('/invoice', requirePermission('sales.write'), ctrl.listInvoices);
r.get('/invoice/:id', requirePermission('sales.write'), ctrl.getInvoice);
r.post('/invoice', requirePermission('sales.write'), requireTenantWriteAccess({ feature: 'sales' }), idem, ctrl.createInvoice);
r.patch('/invoice/:id', requirePermission('sales.write'), requireTenantWriteAccess({ feature: 'sales' }), idem, ctrl.updateInvoice);
r.post('/invoice/:id/dispatch', requirePermission('sales.write'), requireTenantWriteAccess({ feature: 'sales' }), idem, ctrl.dispatchInvoice);
r.post('/invoice/:id/cancel', requirePermission('sales.write'), requireTenantWriteAccess({ feature: 'sales' }), idem, ctrl.cancelInvoice);

export default r;

import { Router } from 'express';
import { authGuard, requireTenant, requirePermission } from '../../middlewares/auth.js';
import * as ctrl from './service.js';

const r = Router();

r.use(authGuard, requireTenant);

r.post('/invoice', requirePermission('sales.write'), ctrl.createInvoice);
r.patch('/invoice/:id', requirePermission('sales.write'), ctrl.updateInvoice);
r.post('/invoice/:id/dispatch', requirePermission('sales.write'), ctrl.dispatchInvoice);
r.post('/invoice/:id/cancel', requirePermission('sales.write'), ctrl.cancelInvoice);

export default r;

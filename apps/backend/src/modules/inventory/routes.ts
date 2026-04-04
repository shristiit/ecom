import { Router } from 'express';
import { authGuard, requireTenant, requirePermission } from '../../middlewares/auth.js';
import { idempotencyGuard } from '../../middlewares/idempotency.js';
import * as ctrl from './service.js';

const r = Router();

r.use(authGuard, requireTenant);
const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

r.get('/stock-on-hand', requirePermission('inventory.read'), ctrl.stockOnHand);
r.get('/movements', requirePermission('inventory.read'), ctrl.movements);
r.get('/receipts', requirePermission('inventory.read'), ctrl.listReceipts);

r.post('/receive', requirePermission('inventory.write'), idem, ctrl.receive);
r.post('/transfer', requirePermission('inventory.write'), idem, ctrl.transfer);
r.post('/adjust', requirePermission('inventory.write'), idem, ctrl.adjust);
r.post('/write-off', requirePermission('inventory.write'), idem, ctrl.writeOff);
r.post('/cycle-count', requirePermission('inventory.write'), idem, ctrl.cycleCount);

export default r;

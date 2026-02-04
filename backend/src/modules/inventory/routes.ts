import { Router } from 'express';
import { authGuard, requireTenant, requirePermission } from '../../middlewares/auth.js';
import * as ctrl from './service.js';

const r = Router();

r.use(authGuard, requireTenant);

r.get('/stock-on-hand', requirePermission('inventory.read'), ctrl.stockOnHand);
r.get('/movements', requirePermission('inventory.read'), ctrl.movements);

r.post('/receive', requirePermission('inventory.write'), ctrl.receive);
r.post('/transfer', requirePermission('inventory.write'), ctrl.transfer);
r.post('/adjust', requirePermission('inventory.write'), ctrl.adjust);
r.post('/write-off', requirePermission('inventory.write'), ctrl.writeOff);
r.post('/cycle-count', requirePermission('inventory.write'), ctrl.cycleCount);

export default r;

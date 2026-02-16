import { Router } from 'express';
import { authGuard, requireTenant, requirePermission } from '../../middlewares/auth.js';
import { idempotencyGuard } from '../../middlewares/idempotency.js';
import * as ctrl from './service.js';

const r = Router();

r.use(authGuard, requireTenant);
const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

r.get('/po', requirePermission('purchasing.write'), ctrl.listPOs);
r.get('/po/:id', requirePermission('purchasing.write'), ctrl.getPO);
r.post('/po', requirePermission('purchasing.write'), idem, ctrl.createPO);
r.patch('/po/:id', requirePermission('purchasing.write'), idem, ctrl.updatePO);
r.post('/po/:id/receive', requirePermission('purchasing.write'), idem, ctrl.receivePO);
r.post('/po/:id/close', requirePermission('purchasing.write'), idem, ctrl.closePO);

export default r;

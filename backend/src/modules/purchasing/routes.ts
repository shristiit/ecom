import { Router } from 'express';
import { authGuard, requireTenant, requirePermission } from '../../middlewares/auth.js';
import * as ctrl from './service.js';

const r = Router();

r.use(authGuard, requireTenant);

r.post('/po', requirePermission('purchasing.write'), ctrl.createPO);
r.patch('/po/:id', requirePermission('purchasing.write'), ctrl.updatePO);
r.post('/po/:id/receive', requirePermission('purchasing.write'), ctrl.receivePO);
r.post('/po/:id/close', requirePermission('purchasing.write'), ctrl.closePO);

export default r;

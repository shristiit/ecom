import { Router } from 'express';
import { authGuard, requireTenant, requirePermission } from '../../middlewares/auth.js';
import * as ctrl from './service.js';

const r = Router();

r.use(authGuard, requireTenant);

r.post('/interpret', requirePermission('chat.use'), ctrl.interpret);
r.post('/confirm', requirePermission('chat.use'), ctrl.confirm);
r.post('/approve', requirePermission('chat.approve'), ctrl.approve);
r.get('/thread/:id', requirePermission('chat.use'), ctrl.thread);

export default r;

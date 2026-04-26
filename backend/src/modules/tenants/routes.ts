import { Router } from 'express';
import * as ctrl from '@backend/modules/tenants/service.js';
import { authGuard, requirePlatformAdmin } from '@backend/middlewares/auth.js';

const r = Router();

r.use(authGuard, requirePlatformAdmin);
r.post('/', ctrl.createTenant);
r.get('/:id', ctrl.getTenant);

export default r;

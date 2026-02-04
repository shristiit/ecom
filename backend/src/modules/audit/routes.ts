import { Router } from 'express';
import { authGuard, requireTenant, requirePermission } from '../../middlewares/auth.js';
import * as ctrl from './service.js';

const r = Router();

r.use(authGuard, requireTenant);

r.get('/query', requirePermission('audit.read'), ctrl.queryAudit);
r.get('/export.csv', requirePermission('audit.read'), ctrl.exportCsv);
r.get('/export.pdf', requirePermission('audit.read'), ctrl.exportPdf);

export default r;

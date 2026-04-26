import { Router } from 'express';
import { authGuard, requirePermission, requireTenantFeatureAccess, requireTenantUser } from '@backend/middlewares/auth.js';
import * as ctrl from '@backend/modules/audit/service.js';

const r = Router();

r.use(authGuard, requireTenantUser, requireTenantFeatureAccess('audit'));

r.get('/query', requirePermission('audit.read'), ctrl.queryAudit);
r.get('/export.csv', requirePermission('audit.read'), ctrl.exportCsv);
r.get('/export.pdf', requirePermission('audit.read'), ctrl.exportPdf);
r.get('/:id', requirePermission('audit.read'), ctrl.getAuditEvent);

export default r;

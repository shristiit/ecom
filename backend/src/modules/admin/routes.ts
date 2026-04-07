import { Router } from 'express';
import { authGuard, requireTenant, requirePermission } from '@backend/middlewares/auth.js';
import { idempotencyGuard } from '@backend/middlewares/idempotency.js';
import * as ctrl from '@backend/modules/admin/service.js';

const r = Router();

r.use(authGuard, requireTenant);
const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

r.get('/users', requirePermission('admin.roles.read'), ctrl.listUsers);
r.get('/users/:id', requirePermission('admin.roles.read'), ctrl.getUser);
r.patch('/users/:id/status', requirePermission('admin.roles.write'), idem, ctrl.updateUserStatus);
r.post('/users/:id/reset-password', requirePermission('admin.roles.write'), idem, ctrl.resetUserPassword);

r.get('/roles', requirePermission('admin.roles.read'), ctrl.listRoles);
r.post('/roles', requirePermission('admin.roles.write'), idem, ctrl.createRole);
r.patch('/roles/:id', requirePermission('admin.roles.write'), idem, ctrl.updateRole);
r.delete('/roles/:id', requirePermission('admin.roles.write'), idem, ctrl.deleteRole);

r.get('/policies', requirePermission('admin.policies.read'), ctrl.listPolicies);
r.post('/policies', requirePermission('admin.policies.write'), idem, ctrl.createPolicy);
r.patch('/policies/:id', requirePermission('admin.policies.write'), idem, ctrl.updatePolicy);
r.delete('/policies/:id', requirePermission('admin.policies.write'), idem, ctrl.deletePolicy);

export default r;

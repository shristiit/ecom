import { Router } from 'express';
import { authGuard, requireTenant, requirePermission } from '../../middlewares/auth.js';
import * as ctrl from './service.js';

const r = Router();

r.use(authGuard, requireTenant);

r.get('/roles', requirePermission('admin.roles.read'), ctrl.listRoles);
r.post('/roles', requirePermission('admin.roles.write'), ctrl.createRole);
r.patch('/roles/:id', requirePermission('admin.roles.write'), ctrl.updateRole);
r.delete('/roles/:id', requirePermission('admin.roles.write'), ctrl.deleteRole);

r.get('/policies', requirePermission('admin.policies.read'), ctrl.listPolicies);
r.post('/policies', requirePermission('admin.policies.write'), ctrl.createPolicy);
r.patch('/policies/:id', requirePermission('admin.policies.write'), ctrl.updatePolicy);
r.delete('/policies/:id', requirePermission('admin.policies.write'), ctrl.deletePolicy);

export default r;

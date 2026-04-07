import { Router } from 'express';
import { authGuard, requireTenant, requirePermission } from '@backend/middlewares/auth.js';
import { idempotencyGuard } from '@backend/middlewares/idempotency.js';
import * as ctrl from '@backend/modules/master/service.js';

const r = Router();

r.use(authGuard, requireTenant);
const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

r.get('/locations', requirePermission('master.read'), ctrl.listLocations);
r.post('/locations', requirePermission('master.write'), idem, ctrl.createLocation);
r.patch('/locations/:id', requirePermission('master.write'), idem, ctrl.updateLocation);
r.delete('/locations/:id', requirePermission('master.write'), idem, ctrl.deleteLocation);

r.get('/suppliers', requirePermission('master.read'), ctrl.listSuppliers);
r.post('/suppliers', requirePermission('master.write'), idem, ctrl.createSupplier);
r.patch('/suppliers/:id', requirePermission('master.write'), idem, ctrl.updateSupplier);
r.delete('/suppliers/:id', requirePermission('master.write'), idem, ctrl.deleteSupplier);

r.get('/customers', requirePermission('master.read'), ctrl.listCustomers);
r.post('/customers', requirePermission('master.write'), idem, ctrl.createCustomer);
r.patch('/customers/:id', requirePermission('master.write'), idem, ctrl.updateCustomer);
r.delete('/customers/:id', requirePermission('master.write'), idem, ctrl.deleteCustomer);

r.get('/categories', requirePermission('master.read'), ctrl.listCategories);
r.post('/categories', requirePermission('master.write'), idem, ctrl.createCategory);
r.patch('/categories/:id', requirePermission('master.write'), idem, ctrl.updateCategory);
r.delete('/categories/:id', requirePermission('master.write'), idem, ctrl.deleteCategory);

export default r;

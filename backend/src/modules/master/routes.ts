import { Router } from 'express';
import { authGuard, requireTenant, requirePermission } from '../../middlewares/auth.js';
import * as ctrl from './service.js';

const r = Router();

r.use(authGuard, requireTenant);

r.get('/locations', requirePermission('master.read'), ctrl.listLocations);
r.post('/locations', requirePermission('master.write'), ctrl.createLocation);
r.patch('/locations/:id', requirePermission('master.write'), ctrl.updateLocation);
r.delete('/locations/:id', requirePermission('master.write'), ctrl.deleteLocation);

r.get('/suppliers', requirePermission('master.read'), ctrl.listSuppliers);
r.post('/suppliers', requirePermission('master.write'), ctrl.createSupplier);
r.patch('/suppliers/:id', requirePermission('master.write'), ctrl.updateSupplier);
r.delete('/suppliers/:id', requirePermission('master.write'), ctrl.deleteSupplier);

r.get('/customers', requirePermission('master.read'), ctrl.listCustomers);
r.post('/customers', requirePermission('master.write'), ctrl.createCustomer);
r.patch('/customers/:id', requirePermission('master.write'), ctrl.updateCustomer);
r.delete('/customers/:id', requirePermission('master.write'), ctrl.deleteCustomer);

r.get('/categories', requirePermission('master.read'), ctrl.listCategories);
r.post('/categories', requirePermission('master.write'), ctrl.createCategory);
r.patch('/categories/:id', requirePermission('master.write'), ctrl.updateCategory);
r.delete('/categories/:id', requirePermission('master.write'), ctrl.deleteCategory);

export default r;

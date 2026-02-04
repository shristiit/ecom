import { Router } from 'express';
import { authGuard, requireTenant, requirePermission } from '../../middlewares/auth.js';
import * as ctrl from './service.js';

const r = Router();

r.use(authGuard, requireTenant);

r.get('/', requirePermission('products.read'), ctrl.listProducts);
r.post('/', requirePermission('products.write'), ctrl.createProduct);
r.get('/:id', requirePermission('products.read'), ctrl.getProduct);
r.patch('/:id', requirePermission('products.write'), ctrl.updateProduct);
r.delete('/:id', requirePermission('products.write'), ctrl.deleteProduct);

r.post('/:id/skus', requirePermission('products.write'), ctrl.createSku);
r.get('/skus/search', requirePermission('products.read'), ctrl.searchSkus);
r.patch('/skus/:skuId', requirePermission('products.write'), ctrl.updateSku);
r.delete('/skus/:skuId', requirePermission('products.write'), ctrl.deleteSku);

r.post('/skus/:skuId/sizes', requirePermission('products.write'), ctrl.createSkuSize);
r.patch('/sizes/:sizeId', requirePermission('products.write'), ctrl.updateSkuSize);
r.delete('/sizes/:sizeId', requirePermission('products.write'), ctrl.deleteSkuSize);

export default r;

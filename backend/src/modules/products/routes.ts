import { Router } from 'express';
import multer from 'multer';
import {
  authGuard,
  requirePermission,
  requireTenantFeatureAccess,
  requireTenantUser,
  requireTenantWriteAccess,
} from '@backend/middlewares/auth.js';
import { idempotencyGuard } from '@backend/middlewares/idempotency.js';
import * as ctrl from '@backend/modules/products/service.js';

const r = Router();
const mediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

r.use(authGuard, requireTenantUser, requireTenantFeatureAccess('products'));
const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

r.get('/', requirePermission('products.read'), ctrl.listProducts);
r.post('/', requirePermission('products.write'), requireTenantWriteAccess({ feature: 'products' }), idem, ctrl.createProduct);
r.post('/compose', requirePermission('products.write'), requireTenantWriteAccess({ feature: 'products' }), idem, ctrl.createComposedProduct);
r.post('/media/upload', requirePermission('products.write'), requireTenantWriteAccess({ feature: 'products' }), mediaUpload.single('file'), ctrl.uploadProductMedia);
r.get('/:id', requirePermission('products.read'), ctrl.getProduct);
r.patch('/:id', requirePermission('products.write'), requireTenantWriteAccess({ feature: 'products' }), idem, ctrl.updateProduct);
r.delete('/:id', requirePermission('products.write'), requireTenantWriteAccess({ feature: 'products' }), idem, ctrl.deleteProduct);

r.post('/:id/skus', requirePermission('products.write'), requireTenantWriteAccess({ feature: 'products' }), idem, ctrl.createSku);
r.get('/skus/search', requirePermission('products.read'), ctrl.searchSkus);
r.patch('/skus/:skuId', requirePermission('products.write'), requireTenantWriteAccess({ feature: 'products' }), idem, ctrl.updateSku);
r.delete('/skus/:skuId', requirePermission('products.write'), requireTenantWriteAccess({ feature: 'products' }), idem, ctrl.deleteSku);

r.post('/skus/:skuId/sizes', requirePermission('products.write'), requireTenantWriteAccess({ feature: 'products' }), idem, ctrl.createSkuSize);
r.patch('/sizes/:sizeId', requirePermission('products.write'), requireTenantWriteAccess({ feature: 'products' }), idem, ctrl.updateSkuSize);
r.delete('/sizes/:sizeId', requirePermission('products.write'), requireTenantWriteAccess({ feature: 'products' }), idem, ctrl.deleteSkuSize);

r.get('/:id/locations', requirePermission('products.read'), ctrl.listProductLocations);
r.post('/:id/locations', requirePermission('products.write'), requireTenantWriteAccess({ feature: 'products' }), idem, ctrl.upsertProductLocation);
r.delete('/:id/locations/:locationId', requirePermission('products.write'), requireTenantWriteAccess({ feature: 'products' }), idem, ctrl.deleteProductLocation);

export default r;

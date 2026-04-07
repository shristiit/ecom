import { Router } from 'express';
import multer from 'multer';
import { authGuard, requireTenant, requirePermission } from '@backend/middlewares/auth.js';
import { idempotencyGuard } from '@backend/middlewares/idempotency.js';
import * as ctrl from '@backend/modules/products/service.js';

const r = Router();
const mediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

r.use(authGuard, requireTenant);
const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

r.get('/', requirePermission('products.read'), ctrl.listProducts);
r.post('/', requirePermission('products.write'), idem, ctrl.createProduct);
r.post('/compose', requirePermission('products.write'), idem, ctrl.createComposedProduct);
r.post('/media/upload', requirePermission('products.write'), mediaUpload.single('file'), ctrl.uploadProductMedia);
r.get('/:id', requirePermission('products.read'), ctrl.getProduct);
r.patch('/:id', requirePermission('products.write'), idem, ctrl.updateProduct);
r.delete('/:id', requirePermission('products.write'), idem, ctrl.deleteProduct);

r.post('/:id/skus', requirePermission('products.write'), idem, ctrl.createSku);
r.get('/skus/search', requirePermission('products.read'), ctrl.searchSkus);
r.patch('/skus/:skuId', requirePermission('products.write'), idem, ctrl.updateSku);
r.delete('/skus/:skuId', requirePermission('products.write'), idem, ctrl.deleteSku);

r.post('/skus/:skuId/sizes', requirePermission('products.write'), idem, ctrl.createSkuSize);
r.patch('/sizes/:sizeId', requirePermission('products.write'), idem, ctrl.updateSkuSize);
r.delete('/sizes/:sizeId', requirePermission('products.write'), idem, ctrl.deleteSkuSize);

r.get('/:id/locations', requirePermission('products.read'), ctrl.listProductLocations);
r.post('/:id/locations', requirePermission('products.write'), idem, ctrl.upsertProductLocation);
r.delete('/:id/locations/:locationId', requirePermission('products.write'), idem, ctrl.deleteProductLocation);

export default r;

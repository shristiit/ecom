import { Router } from 'express';
import * as ctrl from '../controllers/product.controller';

const r = Router();

// Public create: product + variants + sizes
r.post('/', ctrl.createProductDeep);

// Public reads
r.get('/', ctrl.listProducts);
r.get('/:id', ctrl.getProductDeep);

// (Optional) keep these public during dev only; lock down later
r.patch('/:id', ctrl.updateProduct);
r.post('/:id/status', ctrl.setProductStatus);
r.post('/:id/variants', ctrl.addVariant);
r.patch('/variants/:variantId', ctrl.updateVariant);
r.delete('/variants/:variantId', ctrl.deleteVariantCascadeArchive);
r.post('/variants/:variantId/sizes', ctrl.addSize);
r.patch('/sizes/:sizeId', ctrl.updateSize);
r.delete('/sizes/:sizeId', ctrl.deleteSizeArchive);
r.delete('/:id', ctrl.deleteProductCascadeArchive);

export default r;

import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  listProducts,
  getProductBySku,
  getProductByName,
  uploadMediaFiles,
} from '../controllers/product.controller';
import { authGuard } from '../middlewares/authGaurd';
import { roleGuard } from '../middlewares/roleGaurd';
import { upload } from '../config/storage';

const router = Router();
const admin = [authGuard, roleGuard('admin')];


router.post(
  '/create',
  admin,
  [
    body('sku').isString().trim().isLength({ min: 5, max: 30 }),
    body('name').isString().trim().notEmpty(),
    body('description').isString().trim().notEmpty(),
    body('wholesalePrice').optional().isFloat({ min: 0 }),
    body('rrp').optional().isFloat({ min: 0 }),
    body('color').optional().isArray(),
    body('media').optional().isArray(),
    body('media.*.url').optional().isString(),
    body('media.*.type').optional().isIn(['image', 'video']),
  ],
  createProduct
);

router.put(
  '/update',
  admin,
  [
    body('sku').isString().trim().notEmpty(),
    body('name').optional().isString().trim(),
    body('description').optional().isString().trim(),
    body('wholesalePrice').optional().isFloat({ min: 0 }),
    body('rrp').optional().isFloat({ min: 0 }),
    body('color').optional().isArray(),
    body('media').optional().isArray(),
    body('media.*.url').optional().isString(),
    body('media.*.type').optional().isIn(['image', 'video']),
  ],
  updateProduct
);

router.delete(
  '/deletesku',
  admin,
  [body('sku').isString().trim().notEmpty()],
  deleteProduct
);


router.get('/list', authGuard, listProducts);


router.get(
  '/bysku',
  authGuard,
  [query('sku').isString().trim().notEmpty()],
  getProductBySku
);

router.get(
  '/byname',
  authGuard,
  [query('name').isString().trim().notEmpty()],
  getProductByName
);


router.post(
  '/sku/:sku/media/upload',
  admin,
  [param('sku').isString().trim().notEmpty()],
  upload.array('file', 5),
  uploadMediaFiles
);

export default router;

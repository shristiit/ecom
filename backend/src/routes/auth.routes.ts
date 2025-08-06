import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  login,
  register,
  refresh,
  me,
  resetPasswordByEmailOrUsername,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
} from '../controllers/auth.controller';
import { authGuard } from '../middlewares/authGaurd';
import { roleGuard } from '../middlewares/roleGaurd';

const router = Router();

router.post(
  '/register',
  [
    body('username').isString().trim().isLength({ min: 3 }).toLowerCase(),
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 6 }),
    body('role').optional().isIn(['admin', 'customer']).withMessage('Role must be either "admin" or "customer"'),
    // require storenumber; allow nested store.storenumber & tolerate old typo
    body(['storenumber', 'store.storenumber', 'storenymber', 'store.storenymber'])
      .custom((_, { req }) => {
        const v =
          req.body?.storenumber ??
          req.body?.store?.storenumber ??
          req.body?.storenymber ??
          req.body?.store?.storenymber;
        return Number.isFinite(Number(v));
      })
      .withMessage('storenumber is required and must be a number'),
    body('storename').optional().isString().trim(),
    body('manager').optional().isString().trim(),
    body('location').optional().isString().trim(),
    body('address').optional().isString().trim(),
    body('deliveryaddress').optional().isString().trim(),
    body('contact').optional().isString().trim(),
    body('companycontact').optional().isString().trim(),
    body('vat').optional().isString().trim(),
  ],
  register
);

router.post('/login', [body('usernameOrEmail').isString(), body('password').isString()], login);

router.post('/refresh', refresh);

router.get('/me', authGuard, me);

router.get('/users', authGuard, roleGuard('admin'), listUsers);

router.get('/users/:id', authGuard, roleGuard('admin'), param('id').isMongoId(), getUser);

router.patch(
  '/users/:id',
  authGuard,
  roleGuard('admin'),
  [
    param('id').isMongoId(),
    body('username').optional().isString().trim().isLength({ min: 3 }).toLowerCase(),
    body('email').optional().isEmail().normalizeEmail(),
    body('role').optional().isIn(['admin', 'customer']),
    body('password').optional().isString().isLength({ min: 6 }),
    body('storenumber').optional().isInt({ min: 0 }).toInt(),
    body('storename').optional().isString().trim(),
    body('manager').optional().isString().trim(),
    body('location').optional().isString().trim(),
    body('address').optional().isString().trim(),
    body('deliveryaddress').optional().isString().trim(),
    body('contact').optional().isString().trim(),
    body('companycontact').optional().isString().trim(),
    body('vat').optional().isString().trim(),
  ],
  updateUser
);

router.patch(
  '/users/password',
  authGuard,
  roleGuard('admin'),
  body('emailOrUsername').isString().notEmpty(),
  body('newPassword').isString().isLength({ min: 6 }),
  resetPasswordByEmailOrUsername
);

router.delete('/users/:id', authGuard, roleGuard('admin'), param('id').isMongoId(), deleteUser);

export default router;

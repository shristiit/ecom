import { Router } from 'express';
import { body } from 'express-validator';
import { login, register, refresh, me,   resetPasswordByEmailOrUsername, listUsers} from '../controllers/auth.controller';
import { authGuard } from '../middlewares/authGaurd'
import { roleGuard } from '../middlewares/roleGaurd';

const router = Router();

router.post(
  '/register',
  [
    body('username').isString().trim().isLength({ min: 3 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 6 }),
    body('role').optional().isIn(['admin', 'customer']) .withMessage('Role must be either "admin" or "customer"'),
  ],
  register
);

router.post(
  '/login',
  [
    body('usernameOrEmail').isString(),
    body('password').isString()
  ],
  login
);

router.post('/refresh', refresh);

router.get('/me', authGuard, me);

router.get('/users',authGuard,roleGuard ('admin'), listUsers );
console.log(listUsers)
router.patch(
  '/users/password', authGuard, roleGuard('admin'), body('emailOrUsername').isString().notEmpty(), body('newPassword').isString().isLength({ min: 6 }),  resetPasswordByEmailOrUsername );


export default router;

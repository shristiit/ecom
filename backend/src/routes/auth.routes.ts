import { Router } from 'express';
import { body } from 'express-validator';
import { login, register, refresh, me } from '../controllers/auth.controller.js';
import { authGuard } from '../middlewares/authGaurd.js'

const router = Router();

router.post(
  '/register',
  [
    body('username').isString().trim().isLength({ min: 3 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 6 })
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

export default router;

import { Router } from 'express';
import * as ctrl from '@backend/modules/auth/service.js';
import { authGuard, requireTenantUser } from '@backend/middlewares/auth.js';

const r = Router();

r.post('/register-business', ctrl.registerBusiness);
r.post('/register', ctrl.register);
r.post('/login', ctrl.login);
r.post('/refresh', ctrl.refresh);
r.post('/forgot-password', ctrl.forgotPassword);
r.post('/reset-password', ctrl.resetPassword);

// SSO stubs (provider-specific in service)
r.get('/sso/:provider/start', ctrl.ssoStart);
r.get('/sso/:provider/callback', ctrl.ssoCallback);

r.get('/me', authGuard, requireTenantUser, ctrl.me);

export default r;

import { Router } from 'express';
import * as ctrl from './service.js';
import { authGuard } from '../../middlewares/auth.js';

const r = Router();

r.post('/register', ctrl.register);
r.post('/login', ctrl.login);
r.post('/refresh', ctrl.refresh);

// SSO stubs (provider-specific in service)
r.get('/sso/:provider/start', ctrl.ssoStart);
r.get('/sso/:provider/callback', ctrl.ssoCallback);

r.get('/me', authGuard, ctrl.me);

export default r;

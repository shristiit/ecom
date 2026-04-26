import { Router } from 'express';
import { authGuard, requirePlatformAdmin } from '@backend/middlewares/auth.js';
import { idempotencyGuard } from '@backend/middlewares/idempotency.js';
import * as ctrl from '@backend/modules/platform/service.js';

const router = Router();
const idem = idempotencyGuard((req) => req.user?.id ?? null);

router.post('/auth/login', ctrl.login);

router.use(authGuard, requirePlatformAdmin);

router.get('/me', ctrl.me);
router.get('/admins', ctrl.listPlatformAdmins);
router.get('/businesses', ctrl.listBusinesses);
router.get('/businesses/:id', ctrl.getBusiness);
router.patch('/businesses/:id/status', idem, ctrl.updateBusinessStatus);
router.patch('/businesses/:id/entitlements', idem, ctrl.updateBusinessEntitlements);
router.patch('/businesses/:id/limits', idem, ctrl.updateBusinessLimits);
router.get('/businesses/:id/billing', ctrl.getBusinessBilling);
router.post('/businesses/:id/billing/sync', idem, ctrl.syncBusinessBilling);
router.get('/audit', ctrl.listAudit);

export default router;

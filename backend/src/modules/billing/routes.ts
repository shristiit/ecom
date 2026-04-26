import { Router } from 'express';
import {
  authGuard,
  requireTenantFeatureAccess,
  requireTenantUser,
  requireTenantWriteAccess,
} from '@backend/middlewares/auth.js';
import { idempotencyGuard } from '@backend/middlewares/idempotency.js';
import * as ctrl from '@backend/modules/billing/service.js';

const router = Router();
const idem = idempotencyGuard((req) => req.user?.tenantId ?? null);

router.use(authGuard, requireTenantUser, requireTenantFeatureAccess('billing'));

router.get('/', ctrl.getBillingSummary);
router.patch('/subscription', requireTenantWriteAccess({ feature: 'billing' }), idem, ctrl.updateSubscription);
router.patch('/payment-method', requireTenantWriteAccess({ feature: 'billing' }), idem, ctrl.updatePaymentMethod);
router.delete('/payment-method', requireTenantWriteAccess({ feature: 'billing' }), idem, ctrl.removePaymentMethod);
router.post('/ai-usage/check', ctrl.checkAiUsageQuota);
router.post('/ai-usage', ctrl.recordAiUsage);

export default router;

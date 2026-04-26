import { Router } from 'express';
import { authGuard, requirePermission, requireTenantFeatureAccess, requireTenantUser } from '@backend/middlewares/auth.js';
import * as service from '@backend/modules/reporting/service.js';

const router = Router();

router.use(authGuard, requireTenantUser, requireTenantFeatureAccess('reporting'));

router.get('/stock-summary', requirePermission('inventory.read'), service.stockSummary);
router.get('/movement-summary', requirePermission('inventory.read'), service.movementSummary);
router.get('/po-summary', requirePermission('purchasing.read'), service.poSummary);
router.get('/receipt-summary', requirePermission('inventory.read'), service.receiptSummary);

export default router;

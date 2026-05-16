import { Router } from 'express';
import {
  authGuard,
  requirePermission,
  requireTenantFeatureAccess,
  requireTenantUser,
} from '@backend/middlewares/auth.js';
import * as service from '@backend/modules/analytics/service.js';

const router = Router();

router.use(authGuard, requireTenantUser, requireTenantFeatureAccess('inventory'));

router.get('/low-stock', requirePermission('inventory.read'), service.lowStock);
router.get('/top-selling', requirePermission('inventory.read'), service.topSelling);
router.get('/slow-moving', requirePermission('inventory.read'), service.slowMoving);
router.get('/out-of-stock', requirePermission('inventory.read'), service.outOfStock);
router.get('/reorder-needed', requirePermission('inventory.read'), service.reorderNeeded);
router.get('/stock-value', requirePermission('inventory.read'), service.stockValue);
router.get('/no-recent-sales', requirePermission('inventory.read'), service.noRecentSales);
router.get('/high-demand-low-stock', requirePermission('inventory.read'), service.highDemandLowStock);
router.get('/recently-added', requirePermission('inventory.read'), service.recentlyAdded);
router.get('/data-quality', requirePermission('inventory.read'), service.dataQuality);
router.get('/variant-availability', requirePermission('inventory.read'), service.variantAvailability);

export default router;

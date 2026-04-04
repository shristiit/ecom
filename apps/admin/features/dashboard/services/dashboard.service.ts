import { aiService } from '@/features/ai';
import { inventoryService } from '@/features/inventory/services/inventory.service';
import { ordersService } from '@/features/orders/services/orders.service';
import type { DashboardAlert, DashboardKpi, DashboardOverview } from '../types/dashboard.types';

const lowStockThreshold = 5;

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function buildKpis(input: {
  totalOnHand: number;
  totalAvailable: number;
  lowStockCount: number;
  openPurchaseOrders: number;
  openSalesOrders: number;
  pendingApprovals: number;
  stockValue: number;
}): DashboardKpi[] {
  return [
    {
      id: 'total-on-hand',
      label: 'Total on hand',
      value: formatNumber(input.totalOnHand),
      helper: `Available ${formatNumber(input.totalAvailable)}`,
      tone: 'default',
    },
    {
      id: 'stock-value',
      label: 'Stock value',
      value: formatCurrency(input.stockValue),
      helper: 'Estimated at base cost',
      tone: 'info',
    },
    {
      id: 'low-stock',
      label: 'Low stock SKUs',
      value: formatNumber(input.lowStockCount),
      helper: `Threshold <= ${lowStockThreshold}`,
      tone: input.lowStockCount > 0 ? 'warning' : 'success',
    },
    {
      id: 'open-orders',
      label: 'Open orders',
      value: formatNumber(input.openPurchaseOrders + input.openSalesOrders),
      helper: `PO ${input.openPurchaseOrders} / SO ${input.openSalesOrders}`,
      tone: 'default',
    },
    {
      id: 'pending-approvals',
      label: 'Pending approvals',
      value: formatNumber(input.pendingApprovals),
      helper: 'AI + inventory governance',
      tone: input.pendingApprovals > 0 ? 'warning' : 'success',
    },
  ];
}

function buildAlerts(input: {
  lowStockRows: Array<{ id: string; sku: string; locationCode?: string; available: number }>;
  pendingApprovals: number;
  overduePurchaseOrders: number;
}): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  input.lowStockRows.slice(0, 4).forEach((row) => {
    alerts.push({
      id: `low-${row.id}`,
      title: `${row.sku} low at ${row.locationCode || 'location'}`,
      subtitle: `${row.available} available units`,
      tone: 'warning',
      href: '/inventory/stock-on-hand',
    });
  });

  if (input.pendingApprovals > 0) {
    alerts.push({
      id: 'approvals',
      title: `${input.pendingApprovals} pending approvals`,
      subtitle: 'High-risk actions need decision',
      tone: 'warning',
      href: '/ai/approvals',
    });
  }

  if (input.overduePurchaseOrders > 0) {
    alerts.push({
      id: 'po-overdue',
      title: `${input.overduePurchaseOrders} purchase orders overdue`,
      subtitle: 'Expected date already passed',
      tone: 'error',
      href: '/orders/purchase',
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'healthy',
      title: 'All systems healthy',
      subtitle: 'No urgent operational alerts right now',
      tone: 'success',
    });
  }

  return alerts;
}

export const dashboardService = {
  async getOverview(): Promise<DashboardOverview> {
    const [stock, movements, purchaseOrders, salesOrders, approvals] = await Promise.all([
      inventoryService.getStockOnHand(),
      inventoryService.listMovements(),
      ordersService.listPurchaseOrders({ page: 1, pageSize: 50 }),
      ordersService.listSalesOrders({ page: 1, pageSize: 50 }),
      aiService.listApprovals().catch(() => []),
    ]);

    const stockRows = stock.items;
    const totalOnHand = stockRows.reduce((sum, row) => sum + Number(row.onHand ?? 0), 0);
    const totalAvailable = stockRows.reduce((sum, row) => sum + Number(row.available ?? 0), 0);
    const lowStockRows = stockRows
      .filter((row) => Number(row.available ?? 0) <= lowStockThreshold)
      .map((row) => ({
        id: `${row.sizeId ?? row.skuId}-${row.locationId}`,
        sku: row.sku,
        locationCode: row.locationCode,
        available: Number(row.available ?? 0),
      }));
    const lowStockCount = lowStockRows.length;

    const stockValue = stockRows.reduce((sum, row) => sum + Number(row.onHand ?? 0) * 10, 0);

    const openPurchaseOrders = purchaseOrders.items.filter((po) => po.status !== 'closed' && po.status !== 'cancelled').length;
    const openSalesOrders = salesOrders.items.filter((so) => so.status !== 'cancelled' && so.status !== 'dispatched').length;
    const pendingApprovals =
      approvals.filter((item) => item.status === 'pending').length +
      (movements.items ?? []).filter((item) => item.approvalStatus === 'pending').length;

    const today = Date.now();
    const overduePurchaseOrders = purchaseOrders.items.filter((po) => {
      if (!po.expectedAt) return false;
      const expected = new Date(po.expectedAt).getTime();
      if (Number.isNaN(expected)) return false;
      return expected < today && po.status !== 'closed' && po.status !== 'cancelled';
    }).length;

    return {
      kpis: buildKpis({
        totalOnHand,
        totalAvailable,
        lowStockCount,
        openPurchaseOrders,
        openSalesOrders,
        pendingApprovals,
        stockValue,
      }),
      alerts: buildAlerts({
        lowStockRows,
        pendingApprovals,
        overduePurchaseOrders,
      }),
      quickActions: [
        { id: 'product-new', label: 'New Product', href: '/products/new' },
        { id: 'receive', label: 'Receive Stock', href: '/inventory/receipts' },
        { id: 'transfer', label: 'Transfer Stock', href: '/inventory/transfers' },
        { id: 'create-po', label: 'Create PO', href: '/orders/purchase/new' },
        { id: 'create-so', label: 'Create Invoice', href: '/orders/sales/new' },
        { id: 'ai-thread', label: 'AI Thread', href: '/ai' },
      ],
      recentMovements: (movements.items ?? []).slice(0, 8).map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        sku: item.sku,
        movementType: item.movementType,
        quantity: Number(item.quantity ?? 0),
        approvalStatus: item.approvalStatus,
      })),
    };
  },
};

import { query } from '../../db/pool.js';
import { executeReceive, executeTransfer, executeAdjust, executeWriteOff } from '../inventory/service.js';
import { executeCreatePO } from '../purchasing/service.js';
import { executeCreateInvoice } from '../sales/service.js';

export async function executeSpec(tenantId: string, actorId: string, spec: any) {
  const intent = String(spec.intent ?? '').toUpperCase();
  const entities = spec.entities ?? {};
  const quantities = spec.quantities ?? {};

  switch (intent) {
    case 'RECEIVE_STOCK':
      return executeReceive(actorId, tenantId, {
        sizeId: entities.sizeId,
        locationId: entities.locationId,
        quantity: quantities.qty,
        unit: quantities.unit ?? 'unit',
        reason: entities.reason ?? '',
        eventTime: entities.eventTime,
        confirm: true,
        approvalId: spec.approvalId ?? null,
      });

    case 'TRANSFER_STOCK':
      return executeTransfer(actorId, tenantId, {
        sizeId: entities.sizeId,
        fromLocationId: entities.fromLocationId,
        toLocationId: entities.toLocationId,
        quantity: quantities.qty,
        unit: quantities.unit ?? 'unit',
        reason: entities.reason ?? '',
        eventTime: entities.eventTime,
        confirm: true,
        approvalId: spec.approvalId ?? null,
      });

    case 'ADJUST_STOCK':
      return executeAdjust(actorId, tenantId, {
        sizeId: entities.sizeId,
        locationId: entities.locationId,
        quantity: quantities.qty,
        unit: quantities.unit ?? 'unit',
        reason: entities.reason ?? '',
        eventTime: entities.eventTime,
        confirm: true,
        approvalId: spec.approvalId ?? null,
      });

    case 'WRITE_OFF':
      return executeWriteOff(actorId, tenantId, {
        sizeId: entities.sizeId,
        locationId: entities.locationId,
        quantity: quantities.qty,
        unit: quantities.unit ?? 'unit',
        reason: entities.reason ?? '',
        eventTime: entities.eventTime,
        confirm: true,
        approvalId: spec.approvalId ?? null,
      });

    case 'CREATE_PO':
      return executeCreatePO(actorId, tenantId, {
        supplierId: entities.supplierId,
        expectedDate: entities.expectedDate,
        lines: quantities.lines ?? [],
      });

    case 'CREATE_SO':
      return executeCreateInvoice(actorId, tenantId, {
        customerId: entities.customerId,
        lines: quantities.lines ?? [],
      });

    case 'INVENTORY_LEVELS':
      return analyticsInventoryLevels(tenantId, entities);

    case 'LOW_STOCK_ALERTS':
      return analyticsLowStock(tenantId, quantities.threshold ?? 5);

    case 'MOVEMENT_HISTORY':
      return analyticsMovementHistory(tenantId, entities, quantities);

    case 'SALES_SUMMARY':
      return analyticsSalesSummary(tenantId, quantities);

    case 'PO_STATUS':
      return analyticsPOStatus(tenantId);

    default:
      throw new Error('Unsupported intent');
  }
}

async function analyticsInventoryLevels(tenantId: string, entities: any) {
  const sizeId = entities.sizeId ?? null;
  const locationId = entities.locationId ?? null;
  const rows = await query(
    `SELECT size_id, location_id, on_hand, reserved, backorder
     FROM stock_balances
     WHERE tenant_id = $1
     AND ($2::uuid IS NULL OR size_id = $2)
     AND ($3::uuid IS NULL OR location_id = $3)
     ORDER BY updated_at DESC LIMIT 200`,
    [tenantId, sizeId, locationId]
  );
  return { analytics: 'inventory_levels', rows: rows.rows };
}

async function analyticsLowStock(tenantId: string, threshold: number) {
  const rows = await query(
    `SELECT size_id, location_id, on_hand, reserved, backorder,
            (on_hand - reserved) AS available
     FROM stock_balances
     WHERE tenant_id = $1 AND (on_hand - reserved) <= $2
     ORDER BY available ASC LIMIT 200`,
    [tenantId, threshold]
  );
  return { analytics: 'low_stock_alerts', rows: rows.rows };
}

async function analyticsMovementHistory(tenantId: string, entities: any, quantities: any) {
  const sizeId = entities.sizeId ?? null;
  const from = quantities.from ?? null;
  const to = quantities.to ?? null;
  const rows = await query(
    `SELECT * FROM inventory_transactions
     WHERE tenant_id = $1
     AND ($2::uuid IS NULL OR size_id = $2)
     AND ($3::timestamptz IS NULL OR recorded_time >= $3)
     AND ($4::timestamptz IS NULL OR recorded_time <= $4)
     ORDER BY recorded_time DESC LIMIT 200`,
    [tenantId, sizeId, from, to]
  );
  return { analytics: 'movement_history', rows: rows.rows };
}

async function analyticsSalesSummary(tenantId: string, quantities: any) {
  const from = quantities.from ?? null;
  const to = quantities.to ?? null;
  const rows = await query(
    `SELECT COUNT(*)::int as invoice_count, COALESCE(SUM(total),0)::bigint as revenue
     FROM invoices
     WHERE tenant_id = $1
     AND ($2::timestamptz IS NULL OR created_at >= $2)
     AND ($3::timestamptz IS NULL OR created_at <= $3)`,
    [tenantId, from, to]
  );
  return { analytics: 'sales_summary', summary: rows.rows[0] };
}

async function analyticsPOStatus(tenantId: string) {
  const rows = await query(
    `SELECT status, COUNT(*)::int as count
     FROM purchase_orders
     WHERE tenant_id = $1
     GROUP BY status`,
    [tenantId]
  );
  return { analytics: 'po_status', rows: rows.rows };
}

import { Request, Response } from 'express';
import { query } from '../../db/pool.js';

export async function queryAudit(req: Request, res: Response) {
  const { sizeId, from, to } = req.query as any;
  const rows = await query(
    `SELECT * FROM audit_records
     WHERE tenant_id = $1
     AND ($2::uuid IS NULL OR transaction_id IN (SELECT id FROM inventory_transactions WHERE size_id = $2))
     AND ($3::timestamptz IS NULL OR created_at >= $3)
     AND ($4::timestamptz IS NULL OR created_at <= $4)
     ORDER BY created_at DESC LIMIT 500`,
    [req.user!.tenantId, sizeId ?? null, from ?? null, to ?? null]
  );
  res.json(rows.rows);
}

export async function getAuditEvent(req: Request, res: Response) {
  const row = await query(
    `SELECT * FROM audit_records WHERE tenant_id = $1 AND id = $2`,
    [req.user!.tenantId, req.params.id]
  );
  if (row.rowCount === 0) return res.status(404).json({ message: 'Not found' });
  res.json(row.rows[0]);
}

export async function exportCsv(req: Request, res: Response) {
  const rows = await query(
    `SELECT ar.id, ar.transaction_id, ar.request_text, ar.who, ar.approver, ar.before_after, ar.why, ar.created_at
     FROM audit_records ar WHERE ar.tenant_id = $1 ORDER BY ar.created_at DESC LIMIT 10000`,
    [req.user!.tenantId]
  );

  const header = 'id,transaction_id,request_text,who,approver,before_after,why,created_at\n';
  const csv = rows.rows
    .map((r) =>
      [r.id, r.transaction_id, JSON.stringify(r.request_text ?? ''), r.who, r.approver ?? '', JSON.stringify(r.before_after ?? {}), JSON.stringify(r.why ?? ''), r.created_at]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.send(header + csv);
}

export async function exportPdf(_req: Request, res: Response) {
  res.status(501).json({ message: 'PDF export not implemented yet' });
}

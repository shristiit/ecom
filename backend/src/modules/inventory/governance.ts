import { query } from '@backend/db/pool.js';

export type GovernanceDecision = {
  requiresApproval: boolean;
  reason?: string;
};

export async function evaluateGovernance(tenantId: string, op: string, qty: number) {
  const policies = await query(
    `SELECT rules FROM policies WHERE tenant_id = $1`,
    [tenantId]
  );

  let requiresApproval = false;
  let reason = '';

  for (const row of policies.rows) {
    const rules: any[] = row.rules ?? [];
    for (const rule of rules) {
      if (rule.type === 'require_manager_over') {
        const threshold = Number(rule.params?.qty ?? 0);
        if (qty >= threshold) {
          requiresApproval = true;
          reason = `Quantity ${qty} over threshold ${threshold}`;
        }
      }
      if (rule.type === 'max_write_off_qty' && op === 'write_off') {
        const maxQty = Number(rule.params?.maxQty ?? 0);
        if (qty > maxQty) {
          requiresApproval = true;
          reason = `Write-off exceeds max ${maxQty}`;
        }
      }
    }
  }

  return { requiresApproval, reason } as GovernanceDecision;
}

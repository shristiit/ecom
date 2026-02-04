import { pool } from '../../db/pool.js';

export async function releaseExpiredReservations() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const expired = await client.query(
      `SELECT id, tenant_id, size_id, location_id, qty, backorder_qty
       FROM reservations
       WHERE status = 'active' AND expires_at <= NOW() FOR UPDATE`);

    for (const r of expired.rows) {
      await client.query(
        `UPDATE stock_balances
         SET reserved = GREATEST(0, reserved - $1),
             backorder = GREATEST(0, backorder - $2),
             updated_at = NOW()
         WHERE tenant_id = $3 AND size_id = $4 AND location_id = $5`,
        [r.qty, r.backorder_qty, r.tenant_id, r.size_id, r.location_id]
      );

      await client.query(
        `UPDATE reservations SET status = 'released', released_at = NOW() WHERE id = $1`,
        [r.id]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

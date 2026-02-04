import bcrypt from 'bcrypt';
import { query } from '../db/pool.js';

async function run() {
  const tenantRes = await query(
    `INSERT INTO tenants (name, slug) VALUES ($1,$2) RETURNING id`,
    ['Demo Tenant', 'demo']
  );
  const tenantId = tenantRes.rows[0].id;

  const roleRes = await query(
    `INSERT INTO roles (tenant_id, name, permissions) VALUES ($1,$2,$3) RETURNING id`,
    [tenantId, 'admin', [
      'admin.roles.read','admin.roles.write','admin.policies.read','admin.policies.write',
      'products.read','products.write','inventory.read','inventory.write','master.read','master.write',
      'purchasing.write','sales.write','audit.read','chat.use','chat.approve'
    ]]
  );
  const roleId = roleRes.rows[0].id;

  const passwordHash = await bcrypt.hash('ChangeMe123!', 12);
  await query(
    `INSERT INTO users (tenant_id, role_id, email, username, password_hash)
     VALUES ($1,$2,$3,$4,$5)`,
    [tenantId, roleId, 'admin@demo.com', 'admin', passwordHash]
  );

  console.log('Seed complete:', { tenantId, roleId });
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

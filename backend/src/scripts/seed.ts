import bcrypt from 'bcrypt';
import { query } from '../db/pool.js';

const ALL_PERMISSIONS = [
  'admin.roles.read',
  'admin.roles.write',
  'admin.policies.read',
  'admin.policies.write',
  'products.read',
  'products.write',
  'inventory.read',
  'inventory.write',
  'master.read',
  'master.write',
  'purchasing.write',
  'sales.write',
  'audit.read',
  'chat.use',
  'chat.approve',
] as const;

type RoleSeed = {
  name: string;
  permissions: readonly string[];
};

type UserSeed = {
  roleName: string;
  email: string;
  username: string;
};

const ROLE_SEEDS: RoleSeed[] = [
  { name: 'admin', permissions: ALL_PERMISSIONS },
  {
    name: 'inventory_manager',
    permissions: ['inventory.read', 'inventory.write', 'products.read', 'master.read', 'audit.read', 'chat.use'],
  },
  {
    name: 'warehouse_operator',
    permissions: ['inventory.read', 'inventory.write', 'products.read'],
  },
  {
    name: 'purchasing_manager',
    permissions: ['purchasing.write', 'inventory.read', 'products.read', 'master.read', 'master.write', 'audit.read', 'chat.use'],
  },
  {
    name: 'sales_manager',
    permissions: ['sales.write', 'inventory.read', 'products.read', 'master.read', 'audit.read', 'chat.use'],
  },
  {
    name: 'catalog_manager',
    permissions: ['products.read', 'products.write', 'master.read', 'master.write', 'audit.read'],
  },
  {
    name: 'access_admin',
    permissions: ['admin.roles.read', 'admin.roles.write', 'admin.policies.read', 'admin.policies.write', 'audit.read'],
  },
  {
    name: 'auditor',
    permissions: ['audit.read', 'inventory.read', 'products.read', 'master.read'],
  },
  {
    name: 'ai_operator',
    permissions: ['chat.use', 'inventory.read', 'products.read', 'master.read'],
  },
  {
    name: 'ai_approver',
    permissions: ['chat.use', 'chat.approve', 'inventory.read', 'products.read', 'audit.read'],
  },
];

const USER_SEEDS: UserSeed[] = [
  { roleName: 'admin', email: 'admin@demo.com', username: 'admin' },
  { roleName: 'inventory_manager', email: 'inventory.manager@demo.com', username: 'invmanager' },
  { roleName: 'warehouse_operator', email: 'warehouse.operator@demo.com', username: 'warehouseop' },
  { roleName: 'purchasing_manager', email: 'purchasing.manager@demo.com', username: 'purchmanager' },
  { roleName: 'sales_manager', email: 'sales.manager@demo.com', username: 'salesmanager' },
  { roleName: 'catalog_manager', email: 'catalog.manager@demo.com', username: 'catalogmgr' },
  { roleName: 'access_admin', email: 'access.admin@demo.com', username: 'accessadmin' },
  { roleName: 'auditor', email: 'auditor@demo.com', username: 'auditor' },
  { roleName: 'ai_operator', email: 'ai.operator@demo.com', username: 'aioperator' },
  { roleName: 'ai_approver', email: 'ai.approver@demo.com', username: 'aiapprover' },
];

async function run() {
  const tenantName = process.env.SEED_TENANT_NAME ?? 'Demo Tenant';
  const tenantSlug = process.env.SEED_TENANT_SLUG ?? 'demo';
  const seedPassword = process.env.SEED_PASSWORD ?? 'ChangeMe123!';

  const tenantRes = await query(
    `INSERT INTO tenants (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug)
     DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
    [tenantName, tenantSlug]
  );
  const tenantId = tenantRes.rows[0].id;

  const roleIdByName = new Map<string, string>();
  for (const role of ROLE_SEEDS) {
    const roleRes = await query(
      `INSERT INTO roles (tenant_id, name, permissions)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, name)
       DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = NOW()
       RETURNING id`,
      [tenantId, role.name, role.permissions]
    );
    roleIdByName.set(role.name, roleRes.rows[0].id as string);
  }

  const passwordHash = await bcrypt.hash(seedPassword, 12);
  for (const user of USER_SEEDS) {
    const roleId = roleIdByName.get(user.roleName);
    if (!roleId) {
      throw new Error(`Role not found while seeding users: ${user.roleName}`);
    }

    await query(
      `INSERT INTO users (tenant_id, role_id, email, username, password_hash, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (tenant_id, email)
       DO UPDATE SET
         role_id = EXCLUDED.role_id,
         username = EXCLUDED.username,
         password_hash = EXCLUDED.password_hash,
         status = 'active',
         updated_at = NOW()`,
      [tenantId, roleId, user.email.toLowerCase(), user.username.toLowerCase(), passwordHash]
    );
  }

  console.log('Seed complete:', { tenantId, roles: ROLE_SEEDS.length, users: USER_SEEDS.length });
  console.log(`Seed password for all users: ${seedPassword}`);
  console.log('Seeded staff logins:');
  for (const user of USER_SEEDS) {
    console.log(`- ${user.roleName}: ${user.email}`);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

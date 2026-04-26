import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';
import type { PoolClient } from 'pg';
import { pool } from '@backend/db/pool.js';
import { ensureTenantControlPlane, syncSkuUsageCounter } from '@backend/modules/platform/control-plane.js';

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
  'purchasing.read',
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
  firstName: string;
  lastName: string;
};

type LocationRef = {
  id: string;
  name: string;
  code: string;
  type: string;
};

type CategoryRef = {
  id: string;
  name: string;
  slug: string;
};

type SupplierRef = {
  id: string;
  name: string;
};

type UserRef = {
  id: string;
  roleName: string;
  email: string;
  username: string;
};

type ProductRef = {
  id: string;
  name: string;
  styleCode: string;
  basePrice: number;
  pickupEnabled: boolean;
  inventoryMode: 'local' | 'global';
  maxBackorderQty: number | null;
};

type SizeRef = {
  id: string;
  skuId: string;
  productId: string;
  sizeLabel: string;
  unitPrice: number;
};

type CustomerRef = {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'staff' | 'customer';
  authProvider: 'local' | 'auth0';
  primaryAddressId: string | null;
  storeLocationId: string | null;
};

type OrderRef = {
  id: string;
  customerId: string;
  status: string;
};

type InventoryTxRef = {
  id: string;
  type: string;
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
    permissions: ['purchasing.read', 'purchasing.write', 'inventory.read', 'products.read', 'master.read', 'master.write', 'audit.read', 'chat.use'],
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
    permissions: ['chat.use', 'inventory.read', 'products.read', 'master.read', 'purchasing.read'],
  },
  {
    name: 'ai_approver',
    permissions: ['chat.use', 'chat.approve', 'inventory.read', 'products.read', 'purchasing.read', 'audit.read'],
  },
];

const USER_SEEDS: UserSeed[] = [
  { roleName: 'admin', email: 'admin@demo.com', username: 'admin', firstName: 'Avery', lastName: 'Stone' },
  { roleName: 'inventory_manager', email: 'inventory.manager@demo.com', username: 'invmanager', firstName: 'Harper', lastName: 'Mills' },
  { roleName: 'warehouse_operator', email: 'warehouse.operator@demo.com', username: 'warehouseop', firstName: 'Elliot', lastName: 'Cole' },
  { roleName: 'purchasing_manager', email: 'purchasing.manager@demo.com', username: 'purchmanager', firstName: 'Parker', lastName: 'Quinn' },
  { roleName: 'sales_manager', email: 'sales.manager@demo.com', username: 'salesmanager', firstName: 'Jordan', lastName: 'Reed' },
  { roleName: 'catalog_manager', email: 'catalog.manager@demo.com', username: 'catalogmgr', firstName: 'Taylor', lastName: 'Brooks' },
  { roleName: 'access_admin', email: 'access.admin@demo.com', username: 'accessadmin', firstName: 'Morgan', lastName: 'Lane' },
  { roleName: 'auditor', email: 'auditor@demo.com', username: 'auditor', firstName: 'Dakota', lastName: 'Shaw' },
  { roleName: 'ai_operator', email: 'ai.operator@demo.com', username: 'aioperator', firstName: 'Riley', lastName: 'Price' },
  { roleName: 'ai_approver', email: 'ai.approver@demo.com', username: 'aiapprover', firstName: 'Sydney', lastName: 'Cross' },
];

const CATEGORY_NAMES = ['Outerwear', 'Tops', 'Bottoms', 'Footwear', 'Accessories', 'Athleisure'];
const BRAND_NAMES = ['Northline', 'Harbor & Pine', 'Arc Row', 'Field Standard', 'Monarch Goods', 'Oak Circuit'];
const COLOR_PALETTE = [
  { name: 'Black', code: '#111111' },
  { name: 'Navy', code: '#23395B' },
  { name: 'Sand', code: '#C9B79C' },
  { name: 'Olive', code: '#667C3E' },
  { name: 'Clay', code: '#B56A53' },
  { name: 'Cloud', code: '#D9DEE7' },
];
const SIZE_LABELS = ['XS', 'S', 'M', 'L', 'XL'];
const PRODUCT_NOUNS = ['Jacket', 'Hoodie', 'Tee', 'Trouser', 'Runner', 'Cap', 'Overshirt', 'Crewneck', 'Parka', 'Short'];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitizeCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, '').toUpperCase();
}

function randomMoney(min: number, max: number) {
  return faker.number.int({ min, max });
}

function randomDateBetween(startDaysAgo: number, endDaysAhead: number) {
  return faker.date.between({
    from: faker.date.recent({ days: startDaysAgo }),
    to: faker.date.soon({ days: endDaysAhead }),
  });
}

function recentDate(days: number) {
  return faker.date.recent({ days });
}

function imageUrl(seed: string) {
  return `https://picsum.photos/seed/${seed}/1200/1600`;
}

function pickManyUnique<T>(items: T[], min: number, max: number) {
  const target = Math.min(items.length, faker.number.int({ min, max }));
  return faker.helpers.arrayElements(items, target);
}

async function clearTenantData(client: PoolClient, tenantId: string) {
  const tables = [
    'ai_audit_events',
    'ai_action_requests',
    'ai_conversation_messages',
    'ai_workflow_memory',
    'ai_workflows',
    'ai_conversations',
    'audit_records',
    'conversation_turns',
    'approvals',
    'transaction_specs',
    'inventory_transactions',
    'conversations',
    'reservations',
    'idempotency_keys',
    'order_items',
    'orders',
    'saved_items',
    'cart_items',
    'carts',
    'addresses',
    'promotions',
    'receipt_lines',
    'receipts',
    'purchase_order_lines',
    'purchase_orders',
    'invoice_lines',
    'invoices',
    'stock_balances',
    'product_locations',
    'sku_media',
    'product_media',
    'sku_sizes',
    'skus',
    'products',
    'categories',
    'customers',
    'suppliers',
    'locations',
    'policies',
    'sso_identities',
    'users',
    'roles',
  ] as const;

  for (const table of tables) {
    await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
  }
}

async function getOrCreateTenant(client: PoolClient, tenantName: string, tenantSlug: string) {
  const tenantRes = await client.query(
    `INSERT INTO tenants (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug)
     DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
    [tenantName, tenantSlug],
  );

  return tenantRes.rows[0].id as string;
}

async function seedPlatformAdmin(client: PoolClient, passwordHash: string) {
  const email = (process.env.SEED_PLATFORM_ADMIN_EMAIL ?? 'platform@stockaisle.com').toLowerCase();
  const fullName = process.env.SEED_PLATFORM_ADMIN_NAME ?? 'Platform Administrator';

  await client.query(
    `INSERT INTO platform_admins (email, full_name, password_hash, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (email)
     DO UPDATE SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash, status = 'active', updated_at = NOW()`,
    [email, fullName, passwordHash],
  );

  return { email, fullName };
}

async function seedRolesAndUsers(client: PoolClient, tenantId: string, staffPasswordHash: string) {
  const roleIdByName = new Map<string, string>();
  for (const role of ROLE_SEEDS) {
    const roleRes = await client.query(
      `INSERT INTO roles (tenant_id, name, permissions)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [tenantId, role.name, role.permissions],
    );
    roleIdByName.set(role.name, roleRes.rows[0].id as string);
  }

  const users: UserRef[] = [];
  for (const user of USER_SEEDS) {
    const roleId = roleIdByName.get(user.roleName);
    if (!roleId) {
      throw new Error(`Role not found while seeding users: ${user.roleName}`);
    }

    const userRes = await client.query(
      `INSERT INTO users (tenant_id, role_id, email, username, password_hash, status, last_login_at)
       VALUES ($1, $2, $3, $4, $5, 'active', $6)
       RETURNING id, email, username`,
      [tenantId, roleId, user.email.toLowerCase(), user.username.toLowerCase(), staffPasswordHash, recentDate(14)],
    );

    users.push({
      id: userRes.rows[0].id as string,
      roleName: user.roleName,
      email: userRes.rows[0].email as string,
      username: userRes.rows[0].username as string,
    });
  }

  const accessAdmin = users.find((user) => user.roleName === 'access_admin');
  if (accessAdmin) {
    await client.query(
      `INSERT INTO sso_identities (tenant_id, user_id, provider, provider_user_id)
       VALUES ($1, $2, 'auth0', $3)`,
      [tenantId, accessAdmin.id, `auth0|${faker.string.alphanumeric(18)}`],
    );
  }

  return { users, roleIdByName };
}

async function seedPolicies(client: PoolClient, tenantId: string) {
  const policies = [
    {
      name: 'high_volume_movements',
      rules: [
        { type: 'require_manager_over', params: { qty: 25 } },
        { type: 'max_write_off_qty', params: { maxQty: 8 } },
      ],
    },
    {
      name: 'bulk_adjustments',
      rules: [{ type: 'require_manager_over', params: { qty: 40 } }],
    },
  ];

  for (const policy of policies) {
    await client.query(
      `INSERT INTO policies (tenant_id, name, rules)
       VALUES ($1, $2, $3)`,
      [tenantId, policy.name, JSON.stringify(policy.rules)],
    );
  }

  return policies.length;
}

async function seedLocations(client: PoolClient, tenantId: string) {
  const seeds = [
    { name: 'London Central Warehouse', code: 'WH-LON', type: 'warehouse', address: '14 Dock Lane, London, E16 2AB' },
    { name: 'Manchester Overflow Warehouse', code: 'WH-MAN', type: 'warehouse', address: '88 River Mill Road, Manchester, M17 1HB' },
    { name: 'Soho Flagship', code: 'ST-SOH', type: 'store', address: '22 Brewer Street, London, W1F 0SJ' },
    { name: 'Birmingham Exchange', code: 'ST-BHX', type: 'store', address: '5 New Street, Birmingham, B2 4RF' },
  ];

  const locations: LocationRef[] = [];
  for (const seed of seeds) {
    const result = await client.query(
      `INSERT INTO locations (tenant_id, name, code, type, address, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id, name, code, type`,
      [tenantId, seed.name, seed.code, seed.type, seed.address],
    );
    locations.push(result.rows[0] as LocationRef);
  }

  return locations;
}

async function seedCategories(client: PoolClient, tenantId: string) {
  const categories: CategoryRef[] = [];
  for (const name of CATEGORY_NAMES) {
    const result = await client.query(
      `INSERT INTO categories (tenant_id, name, slug)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug`,
      [tenantId, name, slugify(name)],
    );
    categories.push(result.rows[0] as CategoryRef);
  }
  return categories;
}

async function seedSuppliers(client: PoolClient, tenantId: string) {
  const suppliers: SupplierRef[] = [];
  for (let index = 0; index < 8; index += 1) {
    const companyName = faker.company.name();
    const result = await client.query(
      `INSERT INTO suppliers (tenant_id, name, email, phone, address, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id, name`,
      [
        tenantId,
        companyName,
        faker.internet.email({ firstName: companyName.split(' ')[0], provider: 'supplier.demo' }).toLowerCase(),
        faker.phone.number({ style: 'international' }),
        `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.zipCode('??# #??')}`,
      ],
    );
    suppliers.push(result.rows[0] as SupplierRef);
  }
  return suppliers;
}

async function getBalance(client: PoolClient, tenantId: string, sizeId: string, locationId: string) {
  const balanceRes = await client.query(
    `SELECT on_hand, reserved, backorder
     FROM stock_balances
     WHERE tenant_id = $1 AND size_id = $2 AND location_id = $3
     FOR UPDATE`,
    [tenantId, sizeId, locationId],
  );

  if (balanceRes.rowCount === 0) {
    return { onHand: 0, reserved: 0, backorder: 0 };
  }

  return {
    onHand: Number(balanceRes.rows[0].on_hand ?? 0),
    reserved: Number(balanceRes.rows[0].reserved ?? 0),
    backorder: Number(balanceRes.rows[0].backorder ?? 0),
  };
}

async function applyBalanceDelta(
  client: PoolClient,
  tenantId: string,
  sizeId: string,
  locationId: string,
  delta: { onHand?: number; reserved?: number; backorder?: number },
) {
  const before = await getBalance(client, tenantId, sizeId, locationId);
  const after = {
    onHand: Math.max(0, before.onHand + (delta.onHand ?? 0)),
    reserved: Math.max(0, before.reserved + (delta.reserved ?? 0)),
    backorder: Math.max(0, before.backorder + (delta.backorder ?? 0)),
  };

  await client.query(
    `INSERT INTO stock_balances (tenant_id, size_id, location_id, on_hand, reserved, backorder, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (tenant_id, size_id, location_id)
     DO UPDATE SET
       on_hand = EXCLUDED.on_hand,
       reserved = EXCLUDED.reserved,
       backorder = EXCLUDED.backorder,
       updated_at = NOW()`,
    [tenantId, sizeId, locationId, after.onHand, after.reserved, after.backorder],
  );

  return { before, after };
}

async function insertInventoryTransaction(
  client: PoolClient,
  params: {
    tenantId: string;
    type: 'receive' | 'transfer' | 'adjust' | 'write_off' | 'cycle_count' | 'sale';
    sizeId: string;
    skuId: string;
    productId: string;
    fromLocationId?: string | null;
    toLocationId?: string | null;
    quantity: number;
    unit?: string;
    reason: string;
    eventTime: Date;
    createdBy: string;
    confirmedBy?: string | null;
    approvedBy?: string | null;
    beforeAfter: Record<string, unknown>;
    conversationId?: string | null;
  },
) {
  const result = await client.query(
    `INSERT INTO inventory_transactions
     (tenant_id, type, size_id, sku_id, product_id, from_location_id, to_location_id, quantity, unit, reason, event_time, recorded_time, created_by, confirmed_by, approved_by, before_after, conversation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, $13, $14, $15, $16)
     RETURNING id`,
    [
      params.tenantId,
      params.type,
      params.sizeId,
      params.skuId,
      params.productId,
      params.fromLocationId ?? null,
      params.toLocationId ?? null,
      params.quantity,
      params.unit ?? 'unit',
      params.reason,
      params.eventTime,
      params.createdBy,
      params.confirmedBy ?? params.createdBy,
      params.approvedBy ?? null,
      params.beforeAfter,
      params.conversationId ?? null,
    ],
  );

  return result.rows[0].id as string;
}

async function seedCatalog(
  client: PoolClient,
  tenantId: string,
  categories: CategoryRef[],
  locations: LocationRef[],
  users: UserRef[],
) {
  const warehouseLocations = locations.filter((location) => location.type === 'warehouse');
  const storeLocations = locations.filter((location) => location.type === 'store');
  const inventoryManager = users.find((user) => user.roleName === 'inventory_manager') ?? users[0];
  const catalogManager = users.find((user) => user.roleName === 'catalog_manager') ?? users[0];
  const products: ProductRef[] = [];
  const sizes: SizeRef[] = [];
  const inventoryTransactions: InventoryTxRef[] = [];

  for (let productIndex = 0; productIndex < 18; productIndex += 1) {
    const category = faker.helpers.arrayElement(categories);
    const brand = faker.helpers.arrayElement(BRAND_NAMES);
    const noun = faker.helpers.arrayElement(PRODUCT_NOUNS);
    const material = faker.commerce.productAdjective();
    const productName = `${brand.split(' ')[0]} ${material} ${noun}`;
    const styleCode = `STK-${String(productIndex + 1).padStart(4, '0')}`;
    const basePrice = randomMoney(24, 165);
    const pickupEnabled = faker.datatype.boolean(0.7);
    const inventoryMode = faker.helpers.arrayElement(['local', 'global'] as const);
    const maxBackorderQty = inventoryMode === 'global' ? faker.number.int({ min: 4, max: 20 }) : null;
    const status = productIndex < 16 ? 'active' : 'inactive';

    const productRes = await client.query(
      `INSERT INTO products
       (tenant_id, style_code, name, category, brand, base_price, price_visible, inventory_mode, max_backorder_qty, pickup_enabled, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        tenantId,
        styleCode,
        productName,
        category.name,
        brand,
        basePrice,
        faker.datatype.boolean(0.9),
        inventoryMode,
        maxBackorderQty,
        pickupEnabled,
        category.id,
        status,
      ],
    );

    const productId = productRes.rows[0].id as string;
    products.push({ id: productId, name: productName, styleCode, basePrice, pickupEnabled, inventoryMode, maxBackorderQty });

    for (let mediaIndex = 0; mediaIndex < 2; mediaIndex += 1) {
      await client.query(
        `INSERT INTO product_media (tenant_id, product_id, media_url, alt_text, sort_order, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          productId,
          imageUrl(`${styleCode.toLowerCase()}-style-${mediaIndex + 1}`),
          `${productName} image ${mediaIndex + 1}`,
          mediaIndex,
          mediaIndex === 0,
        ],
      );
    }

    for (const location of locations) {
      await client.query(
        `INSERT INTO product_locations (tenant_id, product_id, location_id, is_enabled, pickup_enabled)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          tenantId,
          productId,
          location.id,
          status === 'active',
          pickupEnabled && location.type === 'store' ? faker.datatype.boolean(0.75) : false,
        ],
      );
    }

    const variantColors = pickManyUnique(COLOR_PALETTE, 2, 3);
    for (const [variantIndex, color] of variantColors.entries()) {
      const skuCode = `${styleCode}-${sanitizeCode(color.name).slice(0, 4)}-${String(variantIndex + 1).padStart(2, '0')}`;
      const skuRes = await client.query(
        `INSERT INTO skus (tenant_id, product_id, color_name, color_code, sku_code, price_override, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         RETURNING id`,
        [
          tenantId,
          productId,
          color.name,
          color.code,
          skuCode,
          faker.datatype.boolean(0.2) ? basePrice + faker.number.int({ min: 3, max: 18 }) : null,
        ],
      );
      const skuId = skuRes.rows[0].id as string;

      for (let mediaIndex = 0; mediaIndex < 2; mediaIndex += 1) {
        await client.query(
          `INSERT INTO sku_media (tenant_id, sku_id, media_url, alt_text, sort_order, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            tenantId,
            skuId,
            imageUrl(`${skuCode.toLowerCase()}-${mediaIndex + 1}`),
            `${productName} ${color.name} image ${mediaIndex + 1}`,
            mediaIndex,
            mediaIndex === 0,
          ],
        );
      }

      for (const sizeLabel of SIZE_LABELS) {
        const sizeRes = await client.query(
          `INSERT INTO sku_sizes (tenant_id, sku_id, size_label, barcode, unit_of_measure, pack_size, price_override, status)
           VALUES ($1, $2, $3, $4, 'unit', 1, $5, 'active')
           RETURNING id`,
          [
            tenantId,
            skuId,
            sizeLabel,
            `BC-${sanitizeCode(styleCode)}-${sanitizeCode(color.name).slice(0, 4)}-${sizeLabel}-${faker.string.alphanumeric(6).toUpperCase()}`,
            faker.datatype.boolean(0.15) ? basePrice + faker.number.int({ min: 2, max: 12 }) : null,
          ],
        );

        const sizeId = sizeRes.rows[0].id as string;
        const unitPrice = basePrice + (sizeLabel === 'XL' ? 6 : sizeLabel === 'XS' ? 0 : 3);
        sizes.push({ id: sizeId, skuId, productId, sizeLabel, unitPrice });

        const stockTargets = [
          { location: warehouseLocations[0], quantity: faker.number.int({ min: 35, max: 90 }) },
          { location: warehouseLocations[1], quantity: faker.number.int({ min: 12, max: 40 }) },
          { location: storeLocations[0], quantity: faker.number.int({ min: 0, max: 10 }) },
          { location: storeLocations[1], quantity: faker.number.int({ min: 0, max: 12 }) },
        ];

        for (const stockTarget of stockTargets) {
          if (!stockTarget.location || stockTarget.quantity <= 0) continue;
          const stockChange = await applyBalanceDelta(client, tenantId, sizeId, stockTarget.location.id, { onHand: stockTarget.quantity });
          const transactionId = await insertInventoryTransaction(client, {
            tenantId,
            type: 'receive',
            sizeId,
            skuId,
            productId,
            toLocationId: stockTarget.location.id,
            quantity: stockTarget.quantity,
            reason: 'seed_initial_load',
            eventTime: recentDate(90),
            createdBy: inventoryManager.id,
            confirmedBy: inventoryManager.id,
            beforeAfter: stockChange,
          });
          inventoryTransactions.push({ id: transactionId, type: 'receive' });
        }
      }
    }

    if (productIndex % 5 === 0) {
      const size = faker.helpers.arrayElement(sizes.filter((entry) => entry.productId === productId));
      if (size) {
        const location = faker.helpers.arrayElement(warehouseLocations);
        const cycleBeforeAfter = await applyBalanceDelta(client, tenantId, size.id, location.id, {});
        const transactionId = await insertInventoryTransaction(client, {
          tenantId,
          type: 'cycle_count',
          sizeId: size.id,
          skuId: size.skuId,
          productId,
          toLocationId: location.id,
          quantity: 0,
          reason: 'seed_cycle_count',
          eventTime: recentDate(30),
          createdBy: catalogManager.id,
          confirmedBy: catalogManager.id,
          beforeAfter: cycleBeforeAfter,
        });
        inventoryTransactions.push({ id: transactionId, type: 'cycle_count' });
      }
    }
  }

  return { products, sizes, inventoryTransactions, warehouseLocations, storeLocations };
}

async function seedCustomers(
  client: PoolClient,
  tenantId: string,
  customerPasswordHash: string,
  storeLocations: LocationRef[],
) {
  const customers: CustomerRef[] = [];
  const customerSeeds: Array<{ name: string; email: string; role: 'owner' | 'staff' | 'customer'; authProvider: 'local' | 'auth0' }> = [
    { name: 'Demo Store Owner', email: 'owner@demo.com', role: 'owner', authProvider: 'local' },
    { name: 'Demo Store Staff', email: 'staff@demo.com', role: 'staff', authProvider: 'local' },
    { name: 'Casey Auth0', email: 'casey.auth0@demo.com', role: 'customer', authProvider: 'auth0' },
  ];

  for (let index = 0; index < 15; index += 1) {
    customerSeeds.push({
      name: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      role: 'customer',
      authProvider: 'local',
    });
  }

  for (const seed of customerSeeds) {
    const storeLocationId = faker.datatype.boolean(0.65) ? faker.helpers.arrayElement(storeLocations).id : null;
    const passwordHash = seed.authProvider === 'local' ? customerPasswordHash : null;
    const authUserId = seed.authProvider === 'auth0' ? `auth0|${faker.string.alphanumeric(16)}` : null;

    const customerRes = await client.query(
      `INSERT INTO customers
       (tenant_id, name, email, phone, address, status, currency_preference, auth_provider, auth_user_id, role, store_location_id, password_hash)
       VALUES ($1, $2, $3, $4, $5, 'active', 'GBP', $6, $7, $8, $9, $10)
       RETURNING id, name, email, role, auth_provider, store_location_id`,
      [
        tenantId,
        seed.name,
        seed.email,
        faker.phone.number({ style: 'international' }),
        `${faker.location.streetAddress()}, ${faker.location.city()}`,
        seed.authProvider,
        authUserId,
        seed.role,
        storeLocationId,
        passwordHash,
      ],
    );

    const customerId = customerRes.rows[0].id as string;
    const addressCount = faker.number.int({ min: 1, max: seed.role === 'customer' ? 2 : 1 });
    let primaryAddressId: string | null = null;

    for (let addressIndex = 0; addressIndex < addressCount; addressIndex += 1) {
      const label = addressIndex === 0 ? 'Home' : 'Office';
      const addressRes = await client.query(
        `INSERT INTO addresses (tenant_id, customer_id, label, line1, line2, city, postcode, country)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'GB')
         RETURNING id`,
        [
          tenantId,
          customerId,
          label,
          faker.location.streetAddress(),
          addressIndex === 0 ? '' : faker.location.secondaryAddress(),
          faker.location.city(),
          faker.location.zipCode('??# #??').toUpperCase(),
        ],
      );

      if (!primaryAddressId) {
        primaryAddressId = addressRes.rows[0].id as string;
      }
    }

    customers.push({
      id: customerId,
      name: customerRes.rows[0].name as string,
      email: customerRes.rows[0].email as string,
      role: customerRes.rows[0].role as CustomerRef['role'],
      authProvider: customerRes.rows[0].auth_provider as CustomerRef['authProvider'],
      primaryAddressId,
      storeLocationId: customerRes.rows[0].store_location_id as string | null,
    });
  }

  return customers;
}

async function seedPromotions(client: PoolClient, tenantId: string, categories: CategoryRef[]) {
  const promotions = [
    { type: 'percentage', value: 10, code: 'WELCOME10', appliesTo: { scope: 'all' } },
    { type: 'fixed', value: 15, code: 'SHIP15', appliesTo: { scope: 'shipping' } },
    { type: 'percentage', value: 20, code: 'OUTER20', appliesTo: { categoryId: categories[0]?.id ?? null } },
  ];

  for (const promotion of promotions) {
    await client.query(
      `INSERT INTO promotions (tenant_id, type, value, code, active, starts_at, ends_at, applies_to)
       VALUES ($1, $2, $3, $4, true, $5, $6, $7)`,
      [
        tenantId,
        promotion.type,
        promotion.value,
        promotion.code,
        faker.date.recent({ days: 20 }),
        faker.date.soon({ days: 40 }),
        promotion.appliesTo,
      ],
    );
  }

  return promotions.length;
}

async function seedCartsSavedAndOrders(
  client: PoolClient,
  tenantId: string,
  customers: CustomerRef[],
  sizes: SizeRef[],
  storeLocations: LocationRef[],
  users: UserRef[],
) {
  const salesManager = users.find((user) => user.roleName === 'sales_manager') ?? users[0];
  const orderRefs: OrderRef[] = [];

  for (const customer of customers.slice(0, 8)) {
    const cartRes = await client.query(
      `INSERT INTO carts (tenant_id, customer_id, name, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id`,
      [tenantId, customer.id, customer.role === 'owner' ? 'VIP Cart' : 'Main'],
    );
    const cartId = cartRes.rows[0].id as string;

    for (const size of pickManyUnique(sizes, 1, 3)) {
      await client.query(
        `INSERT INTO cart_items (tenant_id, cart_id, size_id, qty, unit_price, currency, price_visible)
         VALUES ($1, $2, $3, $4, $5, 'GBP', true)`,
        [tenantId, cartId, size.id, faker.number.int({ min: 1, max: 3 }), size.unitPrice],
      );
    }

    for (const size of pickManyUnique(sizes, 0, 2)) {
      await client.query(
        `INSERT INTO saved_items (tenant_id, customer_id, size_id)
         VALUES ($1, $2, $3)`,
        [tenantId, customer.id, size.id],
      );
    }
  }

  const orderStatuses = ['pending', 'processing', 'ready_for_pickup', 'completed', 'cancelled'] as const;

  for (let index = 0; index < 10; index += 1) {
    const customer = faker.helpers.arrayElement(customers);
    const deliveryType = faker.helpers.arrayElement(['shipping', 'pickup'] as const);
    const pickupLocationId = deliveryType === 'pickup' ? faker.helpers.arrayElement(storeLocations).id : null;
    const shippingAddressId = deliveryType === 'shipping' ? customer.primaryAddressId : null;
    const status = orderStatuses[index % orderStatuses.length];
    const selectedSizes = pickManyUnique(sizes, 1, 3);
    const lines = selectedSizes.map((size) => {
      const qty = faker.number.int({ min: 1, max: 3 });
      return {
        size,
        qty,
        unitPrice: size.unitPrice,
        lineTotal: size.unitPrice * qty,
      };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const discountTotal = status === 'completed' && index % 3 === 0 ? Math.min(20, subtotal) : 0;
    const taxTotal = Math.round(subtotal * 0.2);
    const shippingTotal = deliveryType === 'shipping' ? faker.number.int({ min: 0, max: 8 }) : 0;
    const grandTotal = subtotal - discountTotal + taxTotal + shippingTotal;

    const orderRes = await client.query(
      `INSERT INTO orders
       (tenant_id, customer_id, placed_by_user_id, status, currency, subtotal, discount_total, tax_total, shipping_total, grand_total, delivery_type, pickup_location_id, shipping_address_id)
       VALUES ($1, $2, $3, $4, 'GBP', $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        tenantId,
        customer.id,
        customer.role === 'customer' ? null : salesManager.id,
        status,
        subtotal,
        discountTotal,
        taxTotal,
        shippingTotal,
        grandTotal,
        deliveryType,
        pickupLocationId,
        shippingAddressId,
      ],
    );

    const orderId = orderRes.rows[0].id as string;
    orderRefs.push({ id: orderId, customerId: customer.id, status });

    for (const line of lines) {
      await client.query(
        `INSERT INTO order_items (tenant_id, order_id, size_id, qty, unit_price, currency, line_total)
         VALUES ($1, $2, $3, $4, $5, 'GBP', $6)`,
        [tenantId, orderId, line.size.id, line.qty, line.unitPrice, line.lineTotal],
      );

      if (status === 'pending' || status === 'ready_for_pickup') {
        const locationId = pickupLocationId ?? customer.storeLocationId ?? faker.helpers.arrayElement(storeLocations).id;
        const before = await getBalance(client, tenantId, line.size.id, locationId);
        const available = Math.max(0, before.onHand - before.reserved);
        const reserveQty = Math.min(line.qty, available);
        const backorderQty = Math.max(0, line.qty - reserveQty);
        await applyBalanceDelta(client, tenantId, line.size.id, locationId, {
          reserved: reserveQty,
          backorder: backorderQty,
        });

        await client.query(
          `INSERT INTO reservations
           (tenant_id, customer_id, order_id, size_id, location_id, qty, backorder_qty, status, reserved_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), $8)`,
          [tenantId, customer.id, orderId, line.size.id, locationId, reserveQty, backorderQty, faker.date.soon({ days: 2 })],
        );
      }
    }
  }

  return orderRefs;
}

async function seedPurchaseOrdersAndReceipts(
  client: PoolClient,
  tenantId: string,
  suppliers: SupplierRef[],
  sizes: SizeRef[],
  warehouseLocations: LocationRef[],
  users: UserRef[],
) {
  const purchasingManager = users.find((user) => user.roleName === 'purchasing_manager') ?? users[0];
  const adminUser = users.find((user) => user.roleName === 'admin') ?? users[0];
  const inventoryTransactions: InventoryTxRef[] = [];

  for (let index = 0; index < 6; index += 1) {
    const supplier = faker.helpers.arrayElement(suppliers);
    const status = faker.helpers.arrayElement(['draft', 'open', 'closed', 'cancelled'] as const);
    const poRes = await client.query(
      `INSERT INTO purchase_orders (tenant_id, supplier_id, status, expected_date, created_by, approved_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        tenantId,
        supplier.id,
        status,
        faker.date.soon({ days: 21 }),
        purchasingManager.id,
        status === 'open' || status === 'closed' ? adminUser.id : null,
      ],
    );
    const poId = poRes.rows[0].id as string;
    const lines = pickManyUnique(sizes, 2, 4).map((size) => ({
      size,
      qty: faker.number.int({ min: 8, max: 28 }),
      unitCost: Math.max(8, size.unitPrice - faker.number.int({ min: 4, max: 18 })),
    }));

    for (const line of lines) {
      await client.query(
        `INSERT INTO purchase_order_lines (tenant_id, po_id, size_id, qty, unit_cost)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, poId, line.size.id, line.qty, line.unitCost],
      );
    }

    if (status === 'open' || status === 'closed') {
      const location = faker.helpers.arrayElement(warehouseLocations);
      const receiptStatus = status === 'closed' ? 'complete' : 'partial';
      const receiptRes = await client.query(
        `INSERT INTO receipts (tenant_id, po_id, location_id, status, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [tenantId, poId, location.id, receiptStatus, purchasingManager.id, recentDate(45)],
      );
      const receiptId = receiptRes.rows[0].id as string;

      for (const line of lines) {
        const receivedQty = status === 'closed' ? line.qty : Math.max(1, Math.floor(line.qty / 2));
        await client.query(
          `INSERT INTO receipt_lines (tenant_id, receipt_id, size_id, qty, unit_cost)
           VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, receiptId, line.size.id, receivedQty, line.unitCost],
        );

        const stockChange = await applyBalanceDelta(client, tenantId, line.size.id, location.id, { onHand: receivedQty });
        const transactionId = await insertInventoryTransaction(client, {
          tenantId,
          type: 'receive',
          sizeId: line.size.id,
          skuId: line.size.skuId,
          productId: line.size.productId,
          toLocationId: location.id,
          quantity: receivedQty,
          reason: `po_receipt_${poId.slice(0, 8)}`,
          eventTime: recentDate(45),
          createdBy: purchasingManager.id,
          confirmedBy: purchasingManager.id,
          approvedBy: adminUser.id,
          beforeAfter: stockChange,
        });
        inventoryTransactions.push({ id: transactionId, type: 'receive' });
      }
    }
  }

  return inventoryTransactions;
}

async function seedInvoicesAndSales(
  client: PoolClient,
  tenantId: string,
  customers: CustomerRef[],
  sizes: SizeRef[],
  warehouseLocations: LocationRef[],
  users: UserRef[],
) {
  const salesManager = users.find((user) => user.roleName === 'sales_manager') ?? users[0];
  const inventoryTransactions: InventoryTxRef[] = [];
  const invoiceStatuses = ['draft', 'sent', 'paid', 'cancelled'] as const;

  for (let index = 0; index < 7; index += 1) {
    const customer = faker.helpers.arrayElement(customers);
    const status = invoiceStatuses[index % invoiceStatuses.length];
    const location = faker.helpers.arrayElement(warehouseLocations);
    const lines = pickManyUnique(sizes, 1, 3).map((size) => ({
      size,
      qty: faker.number.int({ min: 1, max: 4 }),
      unitPrice: size.unitPrice,
    }));
    const total = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);

    const invoiceRes = await client.query(
      `INSERT INTO invoices (tenant_id, customer_id, status, total, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [tenantId, customer.id, status, total, salesManager.id, recentDate(60), recentDate(15)],
    );
    const invoiceId = invoiceRes.rows[0].id as string;

    for (const line of lines) {
      await client.query(
        `INSERT INTO invoice_lines (tenant_id, invoice_id, size_id, qty, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, invoiceId, line.size.id, line.qty, line.unitPrice],
      );

      if (status === 'sent' || status === 'paid') {
        const stockChange = await applyBalanceDelta(client, tenantId, line.size.id, location.id, { onHand: -line.qty });
        const transactionId = await insertInventoryTransaction(client, {
          tenantId,
          type: 'sale',
          sizeId: line.size.id,
          skuId: line.size.skuId,
          productId: line.size.productId,
          fromLocationId: location.id,
          quantity: line.qty,
          reason: `invoice_${invoiceId.slice(0, 8)}`,
          eventTime: recentDate(20),
          createdBy: salesManager.id,
          confirmedBy: salesManager.id,
          beforeAfter: stockChange,
        });
        inventoryTransactions.push({ id: transactionId, type: 'sale' });
      }
    }
  }

  return inventoryTransactions;
}

async function seedChatAndAudit(
  client: PoolClient,
  tenantId: string,
  users: UserRef[],
  sizes: SizeRef[],
  warehouseLocations: LocationRef[],
  existingTransactions: InventoryTxRef[],
  roleIdByName: Map<string, string>,
) {
  const aiOperator = users.find((user) => user.roleName === 'ai_operator') ?? users[0];
  const aiApprover = users.find((user) => user.roleName === 'ai_approver') ?? users[0];
  const adminRoleId = roleIdByName.get('admin');
  if (!adminRoleId) {
    throw new Error('Admin role missing for approval seed');
  }

  const conversationRes = await client.query(
    `INSERT INTO conversations (tenant_id, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [tenantId, aiOperator.id, recentDate(10), recentDate(1)],
  );
  const conversationId = conversationRes.rows[0].id as string;

  await client.query(
    `INSERT INTO conversation_turns (tenant_id, conversation_id, role, content, metadata)
     VALUES
     ($1, $2, 'user', $3, '{}'),
     ($1, $2, 'assistant', $4, $5)`,
    [
      tenantId,
      conversationId,
      'Move 30 units from London Central Warehouse to Soho Flagship for the weekend launch.',
      'Transfer requires approval because requested quantity is above the policy threshold.',
      {
        intent: 'TRANSFER_STOCK',
        confidence: 0.93,
      },
    ],
  );

  const transferSize = faker.helpers.arrayElement(sizes);
  const transferSpecRes = await client.query(
    `INSERT INTO transaction_specs
     (tenant_id, intent, entities, quantities, constraints, confidence, governance_decision, status, created_by, conversation_id, created_at, updated_at)
     VALUES ($1, 'TRANSFER_STOCK', $2, $3, $4, $5, $6, 'approved', $7, $8, $9, $10)
     RETURNING id`,
    [
      tenantId,
      {
        sizeId: transferSize.id,
        fromLocationId: warehouseLocations[0]?.id ?? null,
        toLocationId: warehouseLocations[1]?.id ?? null,
        reason: 'seed_rebalance',
      },
      { qty: 30, unit: 'unit' },
      {},
      0.93,
      { requiresApproval: true, reason: 'Quantity 30 over threshold 25' },
      aiOperator.id,
      conversationId,
      recentDate(10),
      recentDate(1),
    ],
  );

  const transactionSpecId = transferSpecRes.rows[0].id as string;
  const approvalRes = await client.query(
    `INSERT INTO approvals
     (tenant_id, status, required_role_id, requested_by, approved_by, transaction_spec_id, created_at, updated_at)
     VALUES ($1, 'approved', $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [tenantId, adminRoleId, aiOperator.id, aiApprover.id, transactionSpecId, recentDate(9), recentDate(1)],
  );
  const approvalId = approvalRes.rows[0].id as string;

  const stockBefore = await getBalance(client, tenantId, transferSize.id, warehouseLocations[0].id);
  const transferQty = Math.min(12, Math.max(1, stockBefore.onHand));
  const fromChange = await applyBalanceDelta(client, tenantId, transferSize.id, warehouseLocations[0].id, { onHand: -transferQty });
  await applyBalanceDelta(client, tenantId, transferSize.id, warehouseLocations[1].id, { onHand: transferQty });

  const transferTransactionId = await insertInventoryTransaction(client, {
    tenantId,
    type: 'transfer',
    sizeId: transferSize.id,
    skuId: transferSize.skuId,
    productId: transferSize.productId,
    fromLocationId: warehouseLocations[0].id,
    toLocationId: warehouseLocations[1].id,
    quantity: transferQty,
    reason: 'seed_rebalance',
    eventTime: recentDate(5),
    createdBy: aiOperator.id,
    confirmedBy: aiOperator.id,
    approvedBy: aiApprover.id,
    beforeAfter: fromChange,
    conversationId,
  });

  const writeOffConversationRes = await client.query(
    `INSERT INTO conversations (tenant_id, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [tenantId, aiOperator.id, recentDate(6), recentDate(2)],
  );
  const writeOffConversationId = writeOffConversationRes.rows[0].id as string;
  const writeOffSize = faker.helpers.arrayElement(sizes);

  await client.query(
    `INSERT INTO conversation_turns (tenant_id, conversation_id, role, content, metadata)
     VALUES
     ($1, $2, 'user', $3, '{}'),
     ($1, $2, 'assistant', $4, $5)`,
    [
      tenantId,
      writeOffConversationId,
      'Write off 4 damaged units from the Manchester overflow rack.',
      'Drafted a write-off request and captured the damaged stock reason.',
      { intent: 'WRITE_OFF', confidence: 0.88 },
    ],
  );

  await client.query(
    `INSERT INTO transaction_specs
     (tenant_id, intent, entities, quantities, constraints, confidence, governance_decision, status, created_by, conversation_id, created_at, updated_at)
     VALUES ($1, 'WRITE_OFF', $2, $3, $4, $5, $6, 'confirmed', $7, $8, $9, $10)`,
    [
      tenantId,
      {
        sizeId: writeOffSize.id,
        locationId: warehouseLocations[1]?.id ?? null,
        reason: 'damaged stock',
      },
      { qty: 4, unit: 'unit' },
      {},
      0.88,
      { requiresApproval: false },
      aiOperator.id,
      writeOffConversationId,
      recentDate(6),
      recentDate(2),
    ],
  );

  const writeOffChange = await applyBalanceDelta(client, tenantId, writeOffSize.id, warehouseLocations[1].id, { onHand: -4 });
  const writeOffTransactionId = await insertInventoryTransaction(client, {
    tenantId,
    type: 'write_off',
    sizeId: writeOffSize.id,
    skuId: writeOffSize.skuId,
    productId: writeOffSize.productId,
    fromLocationId: warehouseLocations[1].id,
    quantity: 4,
    reason: 'damaged stock',
    eventTime: recentDate(2),
    createdBy: aiOperator.id,
    confirmedBy: aiOperator.id,
    beforeAfter: writeOffChange,
    conversationId: writeOffConversationId,
  });

  const auditTargets = [transferTransactionId, writeOffTransactionId, ...existingTransactions.slice(0, 3).map((entry) => entry.id)];
  for (const target of auditTargets) {
    await client.query(
      `INSERT INTO audit_records (tenant_id, transaction_id, request_text, who, approver, before_after, why, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenantId,
        target,
        'Generated as part of demo tenant seed data.',
        aiOperator.id,
        target === transferTransactionId ? aiApprover.id : null,
        { source: 'seed', approvalId: target === transferTransactionId ? approvalId : null },
        target === writeOffTransactionId ? 'Damaged stock removed from saleable inventory.' : 'Stock movement recorded for demo reporting.',
        recentDate(7),
      ],
    );
  }

  return { approvalId };
}

async function seedIdempotencyKeys(client: PoolClient, tenantId: string) {
  const entries = [
    {
      key: `seed-cart-${faker.string.alphanumeric(10)}`,
      method: 'POST',
      path: '/api/storefront/cart',
      statusCode: 201,
      responseBody: { ok: true, resource: 'cart' },
    },
    {
      key: `seed-order-${faker.string.alphanumeric(10)}`,
      method: 'POST',
      path: '/api/storefront/orders',
      statusCode: 201,
      responseBody: { ok: true, resource: 'order' },
    },
  ];

  for (const entry of entries) {
    await client.query(
      `INSERT INTO idempotency_keys (tenant_id, key, method, path, request_hash, status_code, response_body)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, entry.key, entry.method, entry.path, faker.string.hexadecimal({ length: 32, casing: 'lower', prefix: '' }), entry.statusCode, entry.responseBody],
    );
  }

  return entries.length;
}

async function run() {
  const tenantName = process.env.SEED_TENANT_NAME ?? 'Demo Tenant';
  const tenantSlug = process.env.SEED_TENANT_SLUG ?? 'demo';
  const seedPassword = process.env.SEED_PASSWORD ?? 'ChangeMe123!';
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD ?? seedPassword;
  const platformPassword = process.env.SEED_PLATFORM_ADMIN_PASSWORD ?? seedPassword;
  const randomSeed = Number(process.env.SEED_RANDOM_SEED ?? '20260320');

  faker.seed(randomSeed);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tenantId = await getOrCreateTenant(client, tenantName, tenantSlug);
    await clearTenantData(client, tenantId);

    const staffPasswordHash = await bcrypt.hash(seedPassword, 12);
    const customerPasswordHash = await bcrypt.hash(customerPassword, 12);
    const platformPasswordHash = await bcrypt.hash(platformPassword, 12);
    const platformAdmin = await seedPlatformAdmin(client, platformPasswordHash);
    await ensureTenantControlPlane(tenantId, { client });

    const { users, roleIdByName } = await seedRolesAndUsers(client, tenantId, staffPasswordHash);
    const policyCount = await seedPolicies(client, tenantId);
    const locations = await seedLocations(client, tenantId);
    const categories = await seedCategories(client, tenantId);
    const suppliers = await seedSuppliers(client, tenantId);
    const { products, sizes, inventoryTransactions: catalogTransactions, warehouseLocations, storeLocations } = await seedCatalog(
      client,
      tenantId,
      categories,
      locations,
      users,
    );
    const customers = await seedCustomers(client, tenantId, customerPasswordHash, storeLocations);
    const promotionCount = await seedPromotions(client, tenantId, categories);
    const orders = await seedCartsSavedAndOrders(client, tenantId, customers, sizes, storeLocations, users);
    const purchaseTransactions = await seedPurchaseOrdersAndReceipts(client, tenantId, suppliers, sizes, warehouseLocations, users);
    const salesTransactions = await seedInvoicesAndSales(client, tenantId, customers, sizes, warehouseLocations, users);
    const { approvalId } = await seedChatAndAudit(
      client,
      tenantId,
      users,
      sizes,
      warehouseLocations,
      [...catalogTransactions, ...purchaseTransactions, ...salesTransactions],
      roleIdByName,
    );
    const idempotencyCount = await seedIdempotencyKeys(client, tenantId);
    await syncSkuUsageCounter(tenantId, client);

    await client.query('COMMIT');

    console.log('Seed complete:', {
      tenantId,
      tenantSlug,
      roles: ROLE_SEEDS.length,
      users: users.length,
      locations: locations.length,
      categories: categories.length,
      suppliers: suppliers.length,
      customers: customers.length,
      products: products.length,
      skus: new Set(sizes.map((size) => size.skuId)).size,
      sizes: sizes.length,
      orders: orders.length,
      promotions: promotionCount,
      inventoryTransactions: catalogTransactions.length + purchaseTransactions.length + salesTransactions.length + 2,
      policies: policyCount,
      approvals: 1,
      idempotencyKeys: idempotencyCount,
    });
    console.log(`Staff password: ${seedPassword}`);
    console.log(`Customer password: ${customerPassword}`);
    console.log(`Platform admin: ${platformAdmin.email}`);
    console.log(`Platform admin password: ${platformPassword}`);
    console.log('Seeded staff logins:');
    for (const user of users) {
      console.log(`- ${user.roleName}: ${user.email}`);
    }
    console.log('Sample customer logins:');
    for (const customer of customers.filter((entry) => entry.authProvider === 'local').slice(0, 4)) {
      console.log(`- ${customer.role}: ${customer.email}`);
    }
    console.log(`Sample approval id: ${approvalId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

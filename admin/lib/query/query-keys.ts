export const queryKeys = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  dashboard: {
    overview: () => ['dashboard', 'overview'] as const,
  },
  products: {
    all: () => ['products'] as const,
    detail: (id: string) => ['products', id] as const,
  },
  inventory: {
    stockOnHand: () => ['inventory', 'stock-on-hand'] as const,
    movements: (scope = 'all') => ['inventory', 'movements', scope] as const,
    receipts: () => ['inventory', 'receipts'] as const,
  },
  orders: {
    sales: () => ['orders', 'sales'] as const,
    purchase: () => ['orders', 'purchase'] as const,
  },
  users: {
    all: () => ['users'] as const,
    roles: () => ['users', 'roles'] as const,
  },
  audit: {
    all: () => ['audit'] as const,
    detail: (id: string) => ['audit', id] as const,
  },
  settings: {
    tenant: () => ['settings', 'tenant'] as const,
  },
  ai: {
    threads: () => ['ai', 'threads'] as const,
    thread: (id: string) => ['ai', 'thread', id] as const,
    approvals: () => ['ai', 'approvals'] as const,
    history: () => ['ai', 'history'] as const,
  },
};

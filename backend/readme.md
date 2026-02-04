StockAisle Backend Documentation (Current State)
1) Architecture Overview
Services

API Gateway (Node.js + Express + TypeScript)
Deterministic writes only
Governance rules evaluated before writes
Multi‑tenant isolation by tenant_id
Conversational Engine (FastAPI, Python)
Interpret-only; no writes
Returns transaction spec + clarifications
Database

PostgreSQL (strict SQL migrations)
node-pg-migrate for schema management
Auth

Hybrid auth:
Internal staff: JWT
Customers: JWT via local credentials or Auth0 ID token exchange
2) Data Model (Tables)
Core Tenant + Governance
tenants
roles (permissions array)
users (staff)
policies (rules for thresholds, approval)
approvals (for gated operations)
sso_identities (SSO link for staff)
Product & Catalog
products (styles)
skus (colors)
sku_sizes (size + unique barcode)
categories
product_locations (product availability/pickup per location)
Product flags

price_visible (hide price → “Contact Seller”)
inventory_mode (local | global)
max_backorder_qty
pickup_enabled
Inventory & Ledger
stock_balances (derived)
inventory_transactions (immutable ledger)
Purchasing
purchase_orders
purchase_order_lines
receipts
receipt_lines
Sales (B2B)
invoices
invoice_lines
Ecommerce (B2C)
customers (roles: owner/staff/customer)
addresses
carts
cart_items
saved_items
orders
order_items
promotions
Conversational Binding + Audit
conversations
conversation_turns
transaction_specs
audit_records
3) Current API Surface
Auth (Staff)
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
GET /api/auth/me
GET /api/auth/sso/:provider/start (stub)
GET /api/auth/sso/:provider/callback (stub)
Tenant + Admin
POST /api/tenants
GET /api/tenants/:id
GET /api/admin/roles
POST /api/admin/roles
PATCH /api/admin/roles/:id
DELETE /api/admin/roles/:id
GET /api/admin/policies
POST /api/admin/policies
PATCH /api/admin/policies/:id
DELETE /api/admin/policies/:id
Master Data
GET /api/master/locations

POST /api/master/locations

PATCH /api/master/locations/:id

DELETE /api/master/locations/:id

GET /api/master/suppliers

POST /api/master/suppliers

PATCH /api/master/suppliers/:id

DELETE /api/master/suppliers/:id

GET /api/master/customers

POST /api/master/customers

PATCH /api/master/customers/:id

DELETE /api/master/customers/:id

GET /api/master/categories

POST /api/master/categories

PATCH /api/master/categories/:id

DELETE /api/master/categories/:id

Products / SKUs / Sizes
GET /api/products

POST /api/products

GET /api/products/:id

PATCH /api/products/:id

DELETE /api/products/:id

POST /api/products/:id/skus

GET /api/products/skus/search

PATCH /api/products/skus/:skuId

DELETE /api/products/skus/:skuId

POST /api/products/skus/:skuId/sizes

PATCH /api/products/sizes/:sizeId

DELETE /api/products/sizes/:sizeId

Product location rules

GET /api/products/:id/locations
POST /api/products/:id/locations
DELETE /api/products/:id/locations/:locationId
Inventory
GET /api/inventory/stock-on-hand
GET /api/inventory/movements
POST /api/inventory/receive
POST /api/inventory/transfer
POST /api/inventory/adjust
POST /api/inventory/write-off
POST /api/inventory/cycle-count
Purchasing
POST /api/purchasing/po
PATCH /api/purchasing/po/:id
POST /api/purchasing/po/:id/receive
POST /api/purchasing/po/:id/close
Sales
POST /api/sales/invoice
PATCH /api/sales/invoice/:id
POST /api/sales/invoice/:id/dispatch
POST /api/sales/invoice/:id/cancel
Audit
GET /api/audit/query
export.csv
export.pdf (stub)
Storefront (Customer App)
Auth

POST /api/storefront/auth/register
POST /api/storefront/auth/login
POST /api/storefront/auth/sso/auth0/exchange
Catalog

GET /api/storefront/categories
GET /api/storefront/products
GET /api/storefront/products/:id
GET /api/storefront/search
Promotions

GET /api/storefront/promotions/available
POST /api/storefront/promotions/apply
Cart + Saved

POST /api/storefront/carts
GET /api/storefront/carts
POST /api/storefront/carts/:id/items
PATCH /api/storefront/carts/:id/items/:itemId
DELETE /api/storefront/carts/:id/items/:itemId
POST /api/storefront/carts/:id/save-for-later
GET /api/storefront/saved
POST /api/storefront/saved
DELETE /api/storefront/saved/:id
Addresses

GET /api/storefront/addresses
POST /api/storefront/addresses
DELETE /api/storefront/addresses/:id
Orders

POST /api/storefront/orders
GET /api/storefront/orders
GET /api/storefront/orders/:id
POST /api/storefront/orders/staff (staff/owner)
4) What We Built (Done)
✅ PostgreSQL schema with strict migrations
✅ Full multi‑tenant model
✅ Product structure: style → sku → size(barcode)
✅ Inventory ledger + balances
✅ Governance rules hook (basic)
✅ Purchasing + sales flows
✅ Storefront e‑commerce backend
✅ Hybrid auth (local + Auth0 exchange)
✅ Location‑based inventory rules
✅ Price visibility + max backorder controls
✅ Pickup enabled per product/location

5) What We Deliberately Deferred
Payments integration
Shipping rates
Promotions calculation engine
Auth0 staff SSO flows (only customer exchange wired)
PDF export
Recommendation engine (ML)
Advanced policy evaluation
Idempotency keys
Eventing/async jobs
Rate limiting
Full observability (Sentry, metrics, tracing)
6) What I Recommend Adding for Robustness
Security & Governance
Idempotency keys for all writes
Row‑level tenant enforcement at DB layer (RLS)
Audit log tamper‑evident hashing
SSO for staff with Auth0 OIDC
Session/token rotation
Scalability & Performance
Partition inventory_transactions by month
Read replicas for reports
Materialized views for inventory snapshots
Caching layer (Redis) for catalog & stock reads
Reliability
Queue system (BullMQ/SQS) for slow tasks
Retry logic for external services
Dead‑letter queues
Compliance
Retention policy for logs
Export & delete flows (GDPR)
Ecommerce hardening
Promotion engine (apply to items/categories)
Max backorder enforcement per size
Reserve expiration (release stock if checkout not completed)
Payment status state machine
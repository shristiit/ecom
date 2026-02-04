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















StockAisle Backend Documentation (Frontend‑Facing)
1) What’s Built (Ready Now)
Core Platform
Multi‑tenant PostgreSQL backend
Roles + permissions (staff) + policies
Product structure: Style → SKU (color) → Size (barcode)
Inventory ledger + balances
Purchase Orders + Receipts
Invoices + dispatch
Storefront ecommerce (cart, orders, saved items)
Hybrid authentication:
Local email/password
Auth0 exchange
Governance gates (confirmations, approvals)
Idempotency keys on all writes
Reservation expiry (stock hold TTL)
Rate limiting
Sentry + structured logging
2) What’s Deferred (Planned Later)
Payments integration
Shipping rates
Auth0 staff role mapping from Auth0
Promotion admin CRUD (engine exists, admin UI later)
Recommendation engine (ML)
PDF audit export
Job queues (async workers)
Row‑level security (RLS) in DB
3) Environment Setup
.env values required:

PORT=4000
DATABASE_URL=postgres://user:pass@localhost:5432/stockaisle

JWT_SECRET=...
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d

CORS_ORIGIN=http://localhost:3000

CONVERSATIONAL_ENGINE_URL=http://localhost:8000

SENTRY_DSN=
RESERVATION_TTL_MIN=30

AUTH0_DOMAIN=dev-gk5mtuqg054rg5lz.us.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
AUTH0_AUDIENCE=...
AUTH0_REDIRECT_URI=http://localhost:4000/api/auth/sso/auth0/callback
DEFAULT_SSO_ROLE_NAME=staff

SSO_PROVIDERS=auth0
4) Auth & Tokens
Staff Auth (Admin + Internal App)
POST /api/auth/login
Returns JWT for staff
Use Authorization: Bearer <token>
Customer Auth (Storefront)
Local:
POST /api/storefront/auth/register
POST /api/storefront/auth/login
Auth0:
POST /api/storefront/auth/sso/auth0/exchange
Customer JWT includes type=customer.

5) Headers Required
All write endpoints
Idempotency-Key: <uuid>
Authorization: Bearer <token>
API Documentation (Frontend)
Health
GET /api/health
Response:

{ "status": "ok" }
A) Storefront (Customer App)
Auth
Register (local)
POST /api/storefront/auth/register

{ "tenantId": "uuid", "name": "John", "email": "a@b.com", "password": "Pass1234" }
Response:

{ "accessToken": "...", "refreshToken": "..." }
Login (local)
POST /api/storefront/auth/login

{ "tenantId": "uuid", "email": "a@b.com", "password": "Pass1234" }
Auth0 Exchange
POST /api/storefront/auth/sso/auth0/exchange

{
  "tenantId": "uuid",
  "idToken": "<auth0 id_token>",
  "audience": "<AUTH0_AUDIENCE>",
  "issuer": "https://dev-gk5mtuqg054rg5lz.us.auth0.com/"
}
Catalog
Categories
GET /api/storefront/categories?tenantId=...

Products
GET /api/storefront/products?tenantId=...

Product Detail
GET /api/storefront/products/:id?tenantId=...

Search
GET /api/storefront/search?q=shirt&tenantId=...

Cart
Create Cart
POST /api/storefront/carts

{ "name": "Main" }
List Carts
GET /api/storefront/carts

Add Item
POST /api/storefront/carts/:id/items

{ "sizeId": "uuid", "qty": 2, "currency": "GBP" }
Update Item
PATCH /api/storefront/carts/:id/items/:itemId

{ "qty": 3 }
Remove Item
DELETE /api/storefront/carts/:id/items/:itemId

Save for Later
POST /api/storefront/carts/:id/save-for-later

{ "itemId": "uuid" }
Saved Items
List
GET /api/storefront/saved

Add
POST /api/storefront/saved

{ "sizeId": "uuid" }
Remove
DELETE /api/storefront/saved/:id

Addresses
List
GET /api/storefront/addresses

Add
POST /api/storefront/addresses

{ "label": "Home", "line1": "...", "line2": "", "city": "...", "postcode": "...", "country": "GB" }
Delete
DELETE /api/storefront/addresses/:id

Promotions
Available
GET /api/storefront/promotions/available?tenantId=...

Apply
POST /api/storefront/promotions/apply

{ "tenantId": "uuid", "code": "SAVE10" }
Orders
Checkout (reserve stock)
POST /api/storefront/orders

{
  "cartId": "uuid",
  "deliveryType": "shipping",
  "shippingAddressId": "uuid",
  "pickupLocationId": null,
  "locationId": "uuid",
  "applyPromotionCode": "SAVE10"
}
Staff Order (on behalf of customer)
POST /api/storefront/orders/staff

{
  "customerId": "uuid",
  "cartId": "uuid",
  "deliveryType": "pickup",
  "pickupLocationId": "uuid",
  "locationId": "uuid",
  "applyPromotionCode": "SAVE10"
}
List Orders
GET /api/storefront/orders

Order Detail
GET /api/storefront/orders/:id

B) Admin / Staff API (Back Office)
Products
GET /api/products
POST /api/products
PATCH /api/products/:id
DELETE /api/products/:id

SKU
POST /api/products/:id/skus
PATCH /api/products/skus/:skuId
DELETE /api/products/skus/:skuId

Sizes
POST /api/products/skus/:skuId/sizes
PATCH /api/products/sizes/:sizeId
DELETE /api/products/sizes/:sizeId

Product Locations
GET /api/products/:id/locations
POST /api/products/:id/locations
DELETE /api/products/:id/locations/:locationId

Inventory
GET /api/inventory/stock-on-hand?sizeId=&locationId=
GET /api/inventory/movements?sizeId=&from=&to=

Writes (idempotent)
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
GET export.csv

6) Business Rules (Frontend should respect)
Price visibility: if price_visible=false, show “Contact Seller”.
Inventory mode:
local → use selected location stock
global → sum across locations
Backorder:
Allowed if max_backorder_qty not exceeded
Pickup:
Allowed only if product + location has pickup enabled
Checkout:
Reserves stock, doesn’t deduct until later (payments integration TBD)
Idempotency‑Key is mandatory for all write calls
7) Next Improvements (Planned)
Payment integrations (Stripe/PayPal/etc)
Shipping calculators
Promotions CRUD admin
Auth0 staff role mapping
Job queue for reservation expiry
Row‑level security in DB
If you want, I can also generate:

Full OpenAPI/Swagger spec
Postman collection
TypeScript SDK for frontend teams
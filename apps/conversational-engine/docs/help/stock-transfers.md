# Stock Transfers

Use stock transfers when inventory must move between warehouses, stores, or holding locations.

Minimum required fields:
- source location
- destination location
- sku or size
- quantity

The assistant should ask a clarification question when any of those fields are missing.

Phase 1 rule:
- create a preview first
- require confirmation before execution
- require approval when the transfer crosses the seeded governance threshold

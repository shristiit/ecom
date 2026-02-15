StockAisle GCTE Documentation
1) Purpose
Convert natural language → structured transaction → explicit confirmation → approval (if required) → deterministic execution → audit.

Strict rule: AI never writes. Only deterministic services write.

2) System Components
Conversational Engine (Python FastAPI)
Input: free‑text
Output: TransactionSpec
No DB writes, no side effects
Backend API Gateway (Node/Express)
Stores transaction specs
Manages confirmations + approvals
Executes deterministic commands
Writes audit records
3) Core Pipeline
Interpret → Validate → Confirm → Approve (if required) → Execute → Audit
Important

Every request must be confirmed.
Approval is one‑level only (MVP).
4) TransactionSpec Object
Stored in DB as transaction_specs:

{
  "id": "uuid",
  "intent": "RECEIVE_STOCK",
  "entities": {
    "sizeId": "uuid",
    "locationId": "uuid",
    "fromLocationId": "uuid",
    "toLocationId": "uuid",
    "supplierId": "uuid",
    "customerId": "uuid",
    "reason": "string",
    "eventTime": "2026-02-04T10:00:00Z"
  },
  "quantities": {
    "qty": 10,
    "unit": "unit",
    "lines": [
      { "sizeId": "uuid", "qty": 5, "unitCost": 1200 }
    ],
    "threshold": 5,
    "from": "2026-01-01T00:00:00Z",
    "to": "2026-01-31T23:59:00Z"
  },
  "constraints": {},
  "confidence": 0.91,
  "governanceDecision": {
    "requiresConfirmation": true,
    "requiresApproval": false
  },
  "status": "proposed"
}
5) Supported MVP Intents
Write intents
RECEIVE_STOCK
TRANSFER_STOCK
ADJUST_STOCK
WRITE_OFF
CREATE_PO
CREATE_SO → executes as Invoice creation
Read/analytics intents
INVENTORY_LEVELS
LOW_STOCK_ALERTS
MOVEMENT_HISTORY
SALES_SUMMARY
PO_STATUS
6) API Endpoints
1. Interpret
POST /api/chat/interpret

Headers

Authorization: Bearer <token>
Idempotency-Key: <uuid>
Body

{ "text": "Move 10 units of size ABC from London to Manchester" }
Response

{
  "conversationId": "uuid",
  "transactionSpecId": "uuid",
  "spec": { ...TransactionSpec }
}
2. Confirm
POST /api/chat/confirm

Headers

Authorization: Bearer <token>
Idempotency-Key: <uuid>
Body

{ "transactionSpecId": "uuid", "confirm": true }
Response

{ "status": "confirmed" }
3. Approve
POST /api/chat/approve

Headers

Authorization: Bearer <token>
Idempotency-Key: <uuid>
Body

{ "approvalId": "uuid", "approve": true }
Response

{ "status": "approved" }
4. Execute
POST /api/chat/execute

Headers

Authorization: Bearer <token>
Idempotency-Key: <uuid>
Body

{ "transactionSpecId": "uuid" }
Response (write intent)

{
  "executed": true,
  "result": {
    "transactionId": "uuid"
  }
}
Response (analytics intent)

{
  "executed": true,
  "result": {
    "analytics": "inventory_levels",
    "rows": [ ... ]
  }
}
7) Required Confirmation Flow (Frontend)
User enters NL input.
Call /interpret.
Show transaction summary + structured data.
User must confirm via /confirm.
If approval required → send to approver → /approve.
When ready, call /execute.
8) Error Cases
Code	Meaning
400	Invalid payload / missing fields
403	Approval required
409	Spec not confirmed
502	Conversational engine error
9) Deterministic Execution Mapping
Intent	Execution
RECEIVE_STOCK	/api/inventory/receive
TRANSFER_STOCK	/api/inventory/transfer
ADJUST_STOCK	/api/inventory/adjust
WRITE_OFF	/api/inventory/write-off
CREATE_PO	/api/purchasing/po
CREATE_SO	/api/sales/invoice
Analytics intents execute DB reads.

10) Frontend UI Requirements
Conversation UI

Text input
List of “Proposed Actions”
Confidence score & missing fields
Confirmation UI

Explicit Yes/No
If requiresApproval, show status
11) OpenAI Integration (Engine)
The engine uses OpenAI Responses API (responses.create) and outputs strict JSON only. If parsing fails, it returns a clarification response.

12) Example Full Flow
User: “Transfer 15 units of size 38 from Dubai to London”

/interpret → spec created
UI shows: size 38, from Dubai, to London, qty 15
User confirms → /confirm
If approval required → /approve
/execute → inventory transfer + audit

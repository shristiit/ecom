# Purchase Order Drafts

Use PO drafts to prepare supplier orders before submission or receiving.

Minimum required fields:
- supplier
- at least one line item
- quantity per line

Expected assistant behavior:
- ask for missing supplier or lines
- show a structured preview
- keep the PO in draft state until the backend tool executes the draft creation/update

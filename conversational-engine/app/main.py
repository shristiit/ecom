import json
import os
from typing import Any, Dict, Optional

from fastapi import FastAPI
from pydantic import BaseModel

try:
    from openai import OpenAI
except Exception:
    OpenAI = None

app = FastAPI()

INTENTS = [
    "RECEIVE_STOCK",
    "TRANSFER_STOCK",
    "ADJUST_STOCK",
    "WRITE_OFF",
    "CREATE_PO",
    "CREATE_SO",
    "INVENTORY_LEVELS",
    "LOW_STOCK_ALERTS",
    "MOVEMENT_HISTORY",
    "SALES_SUMMARY",
    "PO_STATUS",
]

class InterpretRequest(BaseModel):
    text: str
    tenantId: Optional[str] = None

SYSTEM_PROMPT = """
You are a transaction interpreter for StockAisle.
Return ONLY valid JSON matching this schema:
{
  "intent": "<one of INTENTS>",
  "entities": {"sizeId": "", "locationId": "", "fromLocationId": "", "toLocationId": "", "supplierId": "", "customerId": "", "reason": "", "eventTime": ""},
  "quantities": {"qty": 0, "unit": "unit", "lines": [] , "threshold": 0, "from": "", "to": ""},
  "constraints": {},
  "confidence": 0.0,
  "governanceDecision": {"requiresConfirmation": true, "requiresApproval": false},
  "summary": "short human readable"
}
Rules:
- Always set requiresConfirmation=true.
- If missing data, keep fields empty and lower confidence.
- For CREATE_PO or CREATE_SO, quantities.lines must be [{"sizeId":"","qty":0,"unitCost":0}] or [{"sizeId":"","qty":0,"unitPrice":0}].
- For analytics intents, fill quantities.threshold/from/to when mentioned.
"""

@app.post('/interpret')
def interpret(req: InterpretRequest) -> Dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY", "")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    if not api_key or OpenAI is None:
        return {
            "intent": "INVENTORY_LEVELS",
            "entities": {},
            "quantities": {"threshold": 0},
            "constraints": {},
            "confidence": 0.0,
            "governanceDecision": {"requiresConfirmation": True, "requiresApproval": False},
            "summary": "Missing OpenAI configuration; please clarify intent."
        }

    client = OpenAI(api_key=api_key)
    prompt = f"{SYSTEM_PROMPT}\nUser: {req.text}\nJSON:" 

    response = client.responses.create(
        model=model,
        input=prompt,
    )

    text = getattr(response, "output_text", None)
    if not text:
        # fallback for older SDK response shape
        try:
            text = response.output[0].content[0].text
        except Exception:
            text = ""

    try:
        data = json.loads(text)
    except Exception:
        data = {
            "intent": "INVENTORY_LEVELS",
            "entities": {},
            "quantities": {},
            "constraints": {},
            "confidence": 0.0,
            "governanceDecision": {"requiresConfirmation": True, "requiresApproval": False},
            "summary": "Could not parse intent; please clarify."
        }

    # clamp intent to allowed list
    if data.get("intent") not in INTENTS:
        data["intent"] = "INVENTORY_LEVELS"
        data["confidence"] = 0.0

    # always require confirmation
    data.setdefault("governanceDecision", {})
    data["governanceDecision"]["requiresConfirmation"] = True

    return data

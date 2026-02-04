from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any, Dict, Optional

app = FastAPI()

class InterpretRequest(BaseModel):
    text: str
    tenantId: Optional[str] = None

@app.post('/interpret')
def interpret(req: InterpretRequest) -> Dict[str, Any]:
    # TODO: integrate OpenAI/Gemini. For now return a safe, non-committal spec.
    return {
        "intent": "UNKNOWN",
        "entities": {},
        "quantities": {},
        "constraints": {},
        "confidence": 0.0,
        "governanceDecision": {"requiresConfirmation": True, "requiresApproval": False},
        "summary": "I need clarification before proposing a transaction."
    }

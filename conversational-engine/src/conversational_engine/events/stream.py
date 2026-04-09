from __future__ import annotations

import json
from collections.abc import Iterable

from conversational_engine.contracts.runs import RunEvent


def encode_event(event: RunEvent) -> bytes:
    return (json.dumps(event.model_dump(by_alias=True, mode='json')) + '\n').encode('utf-8')


def encode_events(events: Iterable[RunEvent]) -> bytes:
    return b''.join(encode_event(event) for event in events)

from __future__ import annotations

import re

SIZE_LABELS = {'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'} | {str(size) for size in range(2, 31, 2)}


def normalize_text(value: str) -> str:
    return ' '.join(''.join(character.lower() if character.isalnum() else ' ' for character in value).split())


def normalized_tokens(value: str) -> set[str]:
    return {token for token in normalize_text(value).split() if token}


def contains_any(message: str, *needles: str) -> bool:
    normalized = normalize_text(message)
    return any(normalize_text(needle) in normalized for needle in needles)


def matches_intent_pattern(message: str, *patterns: str) -> bool:
    return any(re.search(pattern, message, re.IGNORECASE) for pattern in patterns)


def parse_uuid(text: str) -> str | None:
    match = re.search(
        r'\b[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}\b',
        text,
    )
    return match.group(0) if match else None


def parse_integer(text: str, *, keyword: str | None = None) -> int | None:
    if keyword:
        pattern = re.compile(rf'{re.escape(keyword)}\s*(?:is|of|=)?\s*(\d+)', re.IGNORECASE)
        match = pattern.search(text)
        if match:
            return int(match.group(1))
    match = re.search(r'(?:x|qty|quantity|units?|cost|price|@)\s*(\d+)', text, re.IGNORECASE)
    if match:
        return int(match.group(1))
    standalone = re.search(r'\b(\d+)\b', text)
    return int(standalone.group(1)) if standalone else None


def parse_money(text: str) -> int | None:
    patterns = [
        r'(?:\$|cost|unit cost|base price|price|prce)\s*(?:is|of|=)?\s*(\d+)',
        r'\b(\d+)\s*(?:gbp|usd|eur|pounds?|dollars?)\b',
        r'@\s*(\d+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return int(match.group(1))
    return None


def parse_iso_date(text: str) -> str | None:
    match = re.search(r'\b(20\d{2}-\d{2}-\d{2})\b', text)
    if not match:
        return None
    return f'{match.group(1)}T00:00:00Z'


def parse_size_labels(text: str) -> list[str]:
    labels: list[str] = []
    for token in re.findall(r'\b[A-Za-z0-9]+\b', text.upper()):
        if token in SIZE_LABELS and token not in labels:
            labels.append(token)
    return labels


def extract_color_names(text: str) -> list[str]:
    patterns = [
        r'with\s+([a-zA-Z][a-zA-Z\s,]+?)\s+colors?\b',
        r'colors?\s+(?:are|is|=)?\s*([a-zA-Z][a-zA-Z\s,]+?)(?=\s+(?:with|sizes?|sku|barcode|location|quantity|stock|status)\b|$)',
        r'color\s+(?:is|=)?\s*([a-zA-Z][a-zA-Z\s,]+?)(?=\s+(?:with|sizes?|sku|barcode|location|quantity|stock|status)\b|$)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            continue
        raw = match.group(1)
        tokens = [
            token.strip(" ,")
            for token in re.split(r',|\band\b', raw, flags=re.IGNORECASE)
            if token.strip(" ,")
        ]
        cleaned: list[str] = []
        for token in tokens:
            label = ' '.join(token.split())
            if label and label.lower() not in {'with'} and label not in cleaned:
                cleaned.append(label.title())
        if cleaned:
            return cleaned
    return []

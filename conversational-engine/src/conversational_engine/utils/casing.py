def to_camel(value: str) -> str:
    parts = [part for part in value.split('_') if part]
    if not parts:
        return ''
    return parts[0] + ''.join(part.capitalize() for part in parts[1:])

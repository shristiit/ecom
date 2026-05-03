from conversational_engine.training.redaction import redact_text


def test_redact_text_covers_common_secrets_and_identifiers():
    value = (
        'Email ops@example.com phone +44 20 7946 0958 address 221B Baker Street '
        'Bearer abc.def ghi mongodb://user:pass@cluster/test '
        'AKIA1234567890ABCDEF aws_secret_access_key=supersecretvalue123 '
        'api_key=abcdef12345678 uuid 123e4567-e89b-12d3-a456-426614174000'
    )

    redacted = redact_text(value)

    assert '[redacted-email]' in redacted
    assert '[redacted-phone]' in redacted
    assert '[redacted-address]' in redacted
    assert 'Bearer [redacted-token]' in redacted
    assert '[redacted-mongo-uri]' in redacted
    assert '[redacted-aws-access-key]' in redacted
    assert '[redacted-aws-secret]' in redacted
    assert '[redacted-secret]' in redacted
    assert '[redacted-uuid]' in redacted


def test_redact_text_ignores_invalid_email_like_strings():
    value = 'not-an-email@ localhost user@@example'

    redacted = redact_text(value)

    assert redacted == value

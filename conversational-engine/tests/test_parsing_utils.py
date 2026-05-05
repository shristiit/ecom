from conversational_engine.agents.parsing import parse_money


def test_parse_money_converts_decimal_amounts_to_cents():
    assert parse_money('base price 25.50 usd') == 2550
    assert parse_money('@12.99') == 1299

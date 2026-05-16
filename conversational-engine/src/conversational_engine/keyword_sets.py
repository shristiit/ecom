from __future__ import annotations

import re

NAVIGATION_PREFIXES = (
    'go to ',
    'open ',
    'take me to ',
    'navigate to ',
    'show me ',
    'show ',
)

DOMAIN_KEYWORDS = (
    'adjust',
    'brand',
    'category',
    'color',
    'colors',
    'customer',
    'inventory',
    'invoice',
    'location',
    'movement',
    'po',
    'price',
    'product',
    'products',
    'purchase',
    'purchase order',
    'receipt',
    'report',
    'sales order',
    'size',
    'sizes',
    'sku',
    'stock',
    'supplier',
    'transfer',
    'warehouse',
    'write off',
)

ORCHESTRATOR_DOMAIN_KEYWORDS = (
    'stock',
    'inventory',
    'product',
    'sku',
    'purchase order',
    'po',
    'supplier',
    'customer',
    'invoice',
    'sales order',
    'warehouse',
    'location',
    'report',
    'movement',
    'receipt',
    'transfer',
    'adjust',
    'category',
    'brand',
    'price',
)

NON_DOMAIN_SMALL_TALK = ('hi', 'hello', 'thanks', 'thank you')

MASTER_CREATE_VERBS = ('create', 'add', 'new', 'onboard', 'register')
MASTER_UPDATE_VERBS = ('update', 'edit', 'change', 'rename')
MASTER_DELETE_VERBS = ('delete', 'remove')

LOCATION_NOUNS = ('location', 'warehouse', 'ware house')
SUPPLIER_NOUNS = ('supplier', 'vendor')
CUSTOMER_NOUNS = ('customer', 'client')

STOCK_ADJUSTMENT_PHRASES = ('write off', 'damaged', 'adjust', 'cycle count')
STOCK_RECEIPT_PHRASES = ('receive stock', 'stock receipt')
REPORTING_PHRASES = ('report', 'summary', 'movement', 'receipts', 'receipt summary')
NAVIGATION_HELP_PHRASES = ('help', 'where is', 'how do i', 'how to', 'screen', 'navigate')
STOCK_QUERY_PHRASES = ('stock', 'inventory', 'sku')
PURCHASE_ORDER_REPORTING_PHRASES = ('purchase order', 'po ')

MUTATION_FOLLOW_UP_KEYWORDS = (
    'item',
    'items',
    'qty',
    'quantity',
    'supplier',
    'customer',
    'product',
    'sku',
    'style',
    'color',
    'size',
    'same supplier',
    'same customer',
)

CONTACT_FIELDS = ('name', 'email', 'phone', 'address', 'status')
CONTACT_COMMAND_WORDS = ('create', 'add', 'new', 'onboard', 'register', 'supplier', 'customer', 'vendor', 'client', 'named', 'called')
GENERIC_CONFIRMATION_PHRASES = (
    'yes',
    'yeah',
    'yep',
    'ok',
    'okay',
    'sure',
    'correct',
    'that is correct',
)
REUSE_REFERENCE_PHRASES = (
    'same',
    'same one',
    'same details',
    'same as before',
    'same as previous',
    'use same',
    'use same details',
    'again',
)

RELATIVE_SUPPLIER_TERMS = ('same supplier', 'this supplier', 'that supplier', 'supplier we just created')
RELATIVE_CUSTOMER_TERMS = ('same customer', 'this customer', 'that customer', 'customer we just created')
RELATIVE_PURCHASE_ORDER_TERMS = ('this purchase order', 'that purchase order', 'this po', 'that po')
LATEST_PURCHASE_ORDER_TERMS = ('last purchase order', 'my last purchase order', 'last po', 'my last po', 'latest po')
RELATIVE_INVOICE_TERMS = ('this sales order', 'that sales order', 'this invoice', 'that invoice', 'this so', 'that so')
LATEST_INVOICE_TERMS = ('last sales order', 'my last sales order', 'last invoice', 'my last invoice', 'latest sales order')

COMPOUND_SEQUENCE_VERBS = (
    'create',
    'add',
    'new',
    'onboard',
    'register',
    'update',
    'edit',
    'change',
    'rename',
    'delete',
    'remove',
    'dispatch',
    'ship',
    'cancel',
    'receive',
    'book in',
    'close',
    'show',
    'find',
    'search',
    'list',
)

SIZE_LABEL_ALIASES: tuple[tuple[str, str], ...] = (
    ('extra extra small', 'XXS'),
    ('xxs', 'XXS'),
    ('extra small', 'XS'),
    ('xs', 'XS'),
    ('s', 'S'),
    ('small', 'S'),
    ('sm', 'S'),
    ('m', 'M'),
    ('medium', 'M'),
    ('med', 'M'),
    ('md', 'M'),
    ('l', 'L'),
    ('large', 'L'),
    ('lg', 'L'),
    ('extra large', 'XL'),
    ('xl', 'XL'),
    ('extra extra large', 'XXL'),
    ('xxl', 'XXL'),
)

def regex_union(terms: tuple[str, ...]) -> str:
    return '(?:' + '|'.join(re.escape(term) for term in terms) + ')'


MASTER_CREATE_VERBS_PATTERN = regex_union(MASTER_CREATE_VERBS)
MASTER_UPDATE_VERBS_PATTERN = regex_union(MASTER_UPDATE_VERBS)
MASTER_DELETE_VERBS_PATTERN = regex_union(MASTER_DELETE_VERBS)
LOCATION_NOUNS_PATTERN = regex_union(LOCATION_NOUNS)
SUPPLIER_NOUNS_PATTERN = regex_union(SUPPLIER_NOUNS)
CUSTOMER_NOUNS_PATTERN = regex_union(CUSTOMER_NOUNS)
CONTACT_COMMAND_WORDS_PATTERN = regex_union(CONTACT_COMMAND_WORDS)

ANALYTICS_QUERY_PHRASES = (
    'low stock', 'out of stock', 'top selling', 'best selling', 'best-selling',
    'slow moving', 'slow-moving', 'not sold', 'no sales', 'no recent sales',
    'stock value', 'reorder', 'restock', 'negative stock', 'duplicate sku',
    'data quality', 'missing price', 'zero price', 'missing fields',
    'inactive stock', 'stock mismatch', 'anomal', 'expired', 'returns not',
    'pending po overstocked', 'transfer not received', 'reserved stock',
    'unapproved adjustment', 'multiple cost', 'sold before', 'high demand',
    'below 10', 'below 5', 'below threshold', 'selling faster',
    'stock summary report', 'recently added', 'new products',
)

ANALYTICS_MORE_PHRASES = (
    'show more', 'more results', 'next page', 'see more', 'give me more',
    'load more', 'continue', 'next 10', 'next batch', 'more products',
    'show all', 'give me all', 'show the rest',
)

ANALYTICS_DOWNLOAD_PHRASES = (
    'download', 'export', 'save as csv', 'export to excel',
    'download csv', 'export file', 'download file', 'get file',
)

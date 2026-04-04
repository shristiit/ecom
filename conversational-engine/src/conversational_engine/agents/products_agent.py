from __future__ import annotations

import re

from conversational_engine.agents.base_agent import Agent
from conversational_engine.agents.entity_resolver_agent import EntityResolver
from conversational_engine.agents.parsing_agent import extract_color_names, normalize, parse_money, parse_size_labels
from conversational_engine.agents.types_agent import AgentTurnResult
from conversational_engine.clients.backend_client import BackendClient
from conversational_engine.llm.routing_model import ModelRouting
from conversational_engine.schemas.auth_schemas import AuthContext
from conversational_engine.schemas.shared_schemas import ConversationDetail, ErrorBlock, WorkflowState
from conversational_engine.llm.provider_interfaces import ChatProvider, ProviderMessage
from conversational_engine.llm.json_schema_utils import (
    bool_schema,
    int_schema,
    nullable,
    strict_object_schema,
    string_list_schema,
    string_schema,
)

PRODUCT_EXTRACTION_SCHEMA = strict_object_schema(
    properties={
        'style_code': nullable(string_schema()),
        'name': nullable(string_schema()),
        'base_price': nullable(int_schema()),
        'category': nullable(string_schema()),
        'brand': nullable(string_schema()),
        'status': nullable(string_schema()),
        'pickup_enabled': nullable(bool_schema()),
        'sku_code': nullable(string_schema()),
        'barcode': nullable(string_schema()),
        'media_url': nullable(string_schema()),
        'color_names': nullable(string_list_schema()),
        'size_labels': nullable(string_list_schema()),
        'quantity': nullable(int_schema()),
        'location': nullable(string_schema()),
        'no_initial_stock': nullable(bool_schema()),
        'product': nullable(string_schema()),
    }
)


class ProductsAgent(Agent):
    name = 'products'

    def __init__(
        self,
        *,
        backend: BackendClient,
        resolver: EntityResolver,
        chat_provider: ChatProvider | None,
        routing: ModelRouting,
    ) -> None:
        self._backend = backend
        self._resolver = resolver
        self._chat_provider = chat_provider
        self._routing = routing

    def can_handle(self, intent: str) -> bool:
        return intent in {'product_create', 'product_update'}

    async def handle_turn(
        self,
        *,
        auth: AuthContext,
        conversation: ConversationDetail,
        workflow: WorkflowState,
        intent: str,
        user_message: str,
        memory: dict[str, object],
    ) -> AgentTurnResult:
        del conversation, workflow
        message = user_message.strip()
        normalized = normalize(message)
        extracted: dict[str, object] = {}

        if self._chat_provider:
            model = self._routing.model_for(agent_name=self.name, task='extract')
            try:
                extracted = await self._chat_provider.complete_json(
                    model=model,
                    messages=[
                        ProviderMessage(
                            role='system',
                            content=(
                                'Extract product fields. style_code should be a short code like TSHIRT-123. '
                                'base_price should be an integer. color_names and size_labels should be arrays.'
                            ),
                        ),
                        ProviderMessage(role='user', content=message),
                    ],
                    json_schema=PRODUCT_EXTRACTION_SCHEMA,
                    max_tokens=320,
                )
            except Exception:
                extracted = {}

        memory_updates: dict[str, object] = {}

        if intent == 'product_create':
            memory_updates['actionType'] = 'create_product'
            memory_updates['toolName'] = 'products.createProduct'
        else:
            memory_updates['actionType'] = 'update_product'
            memory_updates['toolName'] = 'products.updateProduct'

        # Basic fields
        style_code = extracted.get('style_code')
        if isinstance(style_code, str) and style_code.strip():
            memory_updates['styleCode'] = style_code.strip().upper()
        elif style := re.search(r'sty(?:le|e)(?:\s*code)?\s*(?:is|=|:)?\s*([A-Za-z0-9_-]+)', message, re.IGNORECASE):
            memory_updates['styleCode'] = style.group(1).strip().upper()

        name_value = extracted.get('name')
        if isinstance(name_value, str) and name_value.strip():
            memory_updates['name'] = name_value.strip()
        else:
            name_match = re.search(
                r'(?:name|named)\s+"?(.+?)"?(?=\s+(?:with|style|category|base|price|colors?|sizes?|sku|barcode|location|stock|qty|quantity)\b|$)',
                message,
                re.IGNORECASE,
            )
            if name_match:
                memory_updates['name'] = name_match.group(1).strip()

        base_price = extracted.get('base_price')
        if isinstance(base_price, int):
            memory_updates['basePrice'] = base_price
        else:
            parsed = parse_money(message)
            if parsed is not None:
                memory_updates['basePrice'] = parsed

        category_text = extracted.get('category')
        if isinstance(category_text, str) and category_text.strip():
            memory_updates['category'] = category_text.strip(' ,')
        else:
            if match := re.search(r'category\s+([a-zA-Z0-9 -]+)', message, re.IGNORECASE):
                memory_updates['category'] = match.group(1).strip()
            elif match := re.search(r'([a-zA-Z0-9 -]+)\s+category\b', message, re.IGNORECASE):
                memory_updates['category'] = match.group(1).strip(' ,')

        brand_text = extracted.get('brand')
        if isinstance(brand_text, str) and brand_text.strip():
            memory_updates['brand'] = brand_text.strip()

        if extracted.get('pickup_enabled') is not None:
            memory_updates['pickupEnabled'] = bool(extracted.get('pickup_enabled'))

        status_text = extracted.get('status')
        if isinstance(status_text, str) and status_text.lower() in {'active', 'inactive'}:
            memory_updates['status'] = status_text.lower()
        elif 'inactive' in normalized:
            memory_updates['status'] = 'inactive'
        elif 'active' in normalized:
            memory_updates['status'] = 'active'

        sku_code = extracted.get('sku_code')
        if isinstance(sku_code, str) and sku_code.strip():
            memory_updates['skuCode'] = sku_code.strip().upper()

        barcode = extracted.get('barcode')
        if isinstance(barcode, str) and barcode.strip():
            memory_updates['barcode'] = barcode.strip()

        media_url = extracted.get('media_url')
        if isinstance(media_url, str) and media_url.strip():
            memory_updates['mediaUrl'] = media_url.strip()
        else:
            media_match = re.search(r'(https?://\S+)', message)
            if media_match:
                memory_updates['mediaUrl'] = media_match.group(1)

        color_names = extracted.get('color_names')
        if isinstance(color_names, list) and color_names:
            memory_updates['colorNames'] = [str(value).title() for value in color_names if str(value).strip()]
            memory_updates['colorName'] = memory_updates['colorNames'][0]
        else:
            colors = extract_color_names(message)
            if colors:
                memory_updates['colorNames'] = colors
                memory_updates['colorName'] = colors[0]

        size_labels = extracted.get('size_labels')
        if isinstance(size_labels, list) and size_labels:
            memory_updates['sizeLabels'] = [str(value).upper() for value in size_labels if str(value).strip()]
        else:
            parsed = parse_size_labels(message)
            if parsed:
                memory_updates['sizeLabels'] = parsed

        if isinstance(extracted.get('quantity'), int):
            memory_updates['quantity'] = int(extracted['quantity'])
        else:
            qty_match = re.search(
                r'(?:\b(?:quantity|qty|initial stock|stock)\s*(?:is|of|=)?\s*(\d+)\b|'
                r'\bhas\s+(\d+)\s+stock\b|\b(\d+)\s+stock\b)',
                message,
                re.IGNORECASE,
            )
            if qty_match:
                memory_updates['quantity'] = int(next(group for group in qty_match.groups() if group is not None))

        location_text = extracted.get('location')
        location = None
        if isinstance(location_text, str) and location_text.strip():
            location = await self._resolver.match_location(auth, location_text)
        location = location or await self._resolver.match_location(auth, message)
        if location:
            memory_updates['locationId'] = location['id']
            memory_updates['locationLabel'] = location['label']

        if extracted.get('no_initial_stock') is True or 'no initial stock' in normalized:
            memory_updates['quantity'] = None
            memory_updates['locationId'] = None
            memory_updates['locationLabel'] = None

        # Resolve categoryId when possible.
        category_match = await self._resolver.match_category(auth, str(memory_updates.get('category') or message))
        if category_match:
            memory_updates['categoryId'] = category_match['id']

        # Product reference for updates.
        if intent == 'product_update':
            product_text = extracted.get('product')
            product_ref = None
            if isinstance(product_text, str) and product_text.strip():
                product_ref = await self._resolver.match_product(auth, product_text)
            product_ref = product_ref or await self._resolver.match_product(auth, message)
            if product_ref:
                memory_updates['productId'] = product_ref['id']
                memory_updates['productName'] = product_ref['label']

        merged = {**memory, **memory_updates}
        missing_fields = self._missing_fields(intent, merged)
        if missing_fields:
            return AgentTurnResult(
                next_action='ask_follow_up',
                memory_updates=memory_updates,
                missing_fields=missing_fields,
                follow_up_prompt=self._prompt(intent, missing_fields),
            )

        action_type = str(merged.get('actionType') or '')
        tool_name = str(merged.get('toolName') or '')

        if action_type == 'create_product':
            preview, execution_payload = self._build_create_payload(auth, merged)
            return AgentTurnResult(
                next_action='prepare_preview',
                memory_updates={
                    **memory_updates,
                    'actionType': action_type,
                    'toolName': tool_name,
                    'executionPayload': execution_payload,
                    'preview': preview,
                    'summary': f'Create product {merged.get("styleCode")} / {merged.get("name")}',
                },
            )

        if action_type == 'update_product':
            if not merged.get('productId'):
                return AgentTurnResult(
                    next_action='return_read_result',
                    memory_updates=memory_updates,
                    blocks=[ErrorBlock(title='Missing product', message='No product could be resolved for update.')],
                )

            await self._hydrate_existing_ids(auth, merged)
            operations = self._build_update_operations(merged)
            preview = {
                'actionType': 'Update Product',
                'actor': auth.email,
                'entities': operations.get('previewEntities', []),
                'warnings': [],
                'nextStep': 'Confirm to submit this request for approval.',
            }
            return AgentTurnResult(
                next_action='prepare_preview',
                memory_updates={
                    **memory_updates,
                    'actionType': action_type,
                    'toolName': tool_name,
                    'executionPayload': operations,
                    'preview': preview,
                    'summary': f'Update product {merged.get("productName", merged.get("productId"))}',
                },
            )

        return AgentTurnResult(
            next_action='return_read_result',
            memory_updates=memory_updates,
            blocks=[ErrorBlock(title='Unsupported product action', message=f'Unknown action type: {action_type}')],
        )

    @staticmethod
    def _missing_fields(intent: str, memory: dict[str, object]) -> list[str]:
        required: list[str]
        if intent == 'product_create':
            required = ['style_code', 'name', 'base_price', 'category', 'color_name', 'size_labels']
            if ('quantity' in memory) ^ ('locationId' in memory):
                required.append('location_and_quantity')
        else:
            required = ['product_id', 'changes']

        missing: list[str] = []
        for field in required:
            if field == 'style_code' and not memory.get('styleCode'):
                missing.append(field)
            elif field == 'name' and not memory.get('name'):
                missing.append(field)
            elif field == 'base_price' and memory.get('basePrice') is None:
                missing.append(field)
            elif field == 'category' and not memory.get('category'):
                missing.append(field)
            elif field == 'color_name' and not memory.get('colorName'):
                missing.append(field)
            elif field == 'size_labels' and not memory.get('sizeLabels'):
                missing.append(field)
            elif field == 'location_and_quantity' and (not memory.get('locationId') or memory.get('quantity') is None):
                missing.append(field)
            elif field == 'product_id' and not memory.get('productId'):
                missing.append(field)
            elif field == 'changes':
                if not any(
                    memory.get(key) is not None
                    for key in (
                        'styleCode',
                        'name',
                        'category',
                        'brand',
                        'basePrice',
                        'skuCode',
                        'colorName',
                        'sizeLabels',
                        'locationId',
                        'status',
                        'pickupEnabled',
                    )
                ):
                    missing.append(field)
        return missing

    @staticmethod
    def _prompt(intent: str, missing_fields: list[str]) -> str:
        if intent == 'product_create':
            prompts = {
                'style_code': 'What style code should this product use?',
                'name': 'What product name should I use?',
                'base_price': 'What base price should I set?',
                'category': 'Which category should the product belong to?',
                'color_name': 'What is the first variant color?',
                'size_labels': 'Which sizes should I create? Reply like `S, M, L`.',
                'location_and_quantity': (
                    'If you want initial stock, reply with both location and quantity. '
                    'Otherwise say `no initial stock`.'
                ),
            }
            return prompts[missing_fields[0]]
        if 'product_id' in missing_fields:
            return 'Which product should I update? Reply with the product name, style code, or product id.'
        return (
            'What should change on this product? You can update base fields, add or update a SKU, '
            'add a size, or enable a location.'
        )

    @staticmethod
    def _build_create_payload(
        auth: AuthContext, memory: dict[str, object]
    ) -> tuple[dict[str, object], dict[str, object]]:
        size_labels = [str(label) for label in memory.get('sizeLabels', [])]
        color_names = [str(label) for label in memory.get('colorNames', [])] or [str(memory.get('colorName', ''))]
        stock_by_size = memory.get('sizeQuantities') if isinstance(memory.get('sizeQuantities'), dict) else {}

        media: list[dict[str, object]] = []
        if memory.get('mediaUrl'):
            media.append(
                {
                    'url': memory['mediaUrl'],
                    'altText': str(memory.get('name', '')),
                    'sortOrder': 0,
                    'isPrimary': True,
                }
            )

        execution_payload: dict[str, object] = {
            'product': {
                'styleCode': memory['styleCode'],
                'name': memory['name'],
                'category': memory.get('category', ''),
                'brand': memory.get('brand', ''),
                'basePrice': memory['basePrice'],
                'categoryId': memory.get('categoryId'),
                'status': memory.get('status', 'active'),
            },
            'styleMedia': media,
            'variants': [],
        }

        for index, color_name in enumerate(color_names):
            variant: dict[str, object] = {
                'colorName': color_name,
                'media': media,
                'sizes': [],
            }
            if memory.get('skuCode') and index == 0:
                variant['skuCode'] = memory['skuCode']

            for size_label in size_labels:
                stock_by_location: list[dict[str, object]] = []
                if memory.get('locationId'):
                    per_size_quantity = stock_by_size.get(size_label)
                    if per_size_quantity is not None:
                        stock_by_location = [{'locationId': memory['locationId'], 'quantity': int(per_size_quantity)}]
                    elif memory.get('quantity') is not None and len(size_labels) == 1:
                        stock_by_location = [{'locationId': memory['locationId'], 'quantity': memory['quantity']}]
                variant['sizes'].append({'sizeLabel': size_label, 'stockByLocation': stock_by_location})

            execution_payload['variants'].append(variant)

        entities = [
            {'label': 'Style code', 'value': str(memory.get('styleCode', ''))},
            {'label': 'Name', 'value': str(memory.get('name', ''))},
            {'label': 'Category', 'value': str(memory.get('category', ''))},
            {'label': 'Variants', 'value': ', '.join(color_names)},
            {'label': 'Sizes', 'value': ', '.join(size_labels)},
        ]
        if memory.get('locationLabel'):
            stock_summary = (
                ', '.join(f'{size}:{qty}' for size, qty in stock_by_size.items())
                if stock_by_size
                else str(memory.get('quantity', 0))
            )
            entities.append({'label': 'Initial stock', 'value': f'{stock_summary} at {memory.get("locationLabel")}'})

        preview = {
            'actionType': 'Create Product',
            'actor': auth.email,
            'entities': entities,
            'warnings': [],
            'nextStep': 'Confirm to submit this request for approval.',
        }
        return preview, execution_payload

    def _build_update_operations(self, memory: dict[str, object]) -> dict[str, object]:
        product_patch: dict[str, object] = {}
        for source, target in (
            ('styleCode', 'styleCode'),
            ('name', 'name'),
            ('category', 'category'),
            ('brand', 'brand'),
            ('basePrice', 'basePrice'),
            ('categoryId', 'categoryId'),
            ('status', 'status'),
            ('pickupEnabled', 'pickupEnabled'),
        ):
            if memory.get(source) is not None:
                product_patch[target] = memory[source]

        preview_entities = [{'label': 'Product', 'value': str(memory.get('productName', memory.get('productId', '')))}]
        sku_ops: list[dict[str, object]] = []
        size_ops: list[dict[str, object]] = []
        location_ops: list[dict[str, object]] = []

        if memory.get('skuCode') or memory.get('colorName'):
            if memory.get('existingSkuId'):
                sku_ops.append(
                    {
                        'op': 'update',
                        'skuId': memory['existingSkuId'],
                        'payload': {
                            key: value
                            for key, value in {
                                'skuCode': memory.get('skuCode'),
                                'colorName': memory.get('colorName'),
                                'status': memory.get('status'),
                            }.items()
                            if value is not None
                        },
                    }
                )
                preview_entities.append({'label': 'SKU update', 'value': str(memory.get('skuCode', 'existing'))})
            else:
                sku_ops.append(
                    {
                        'op': 'create',
                        'payload': {
                            'skuCode': memory['skuCode'],
                            'colorName': memory.get('colorName', 'Default'),
                            'status': memory.get('status', 'active'),
                        },
                    }
                )
                preview_entities.append({'label': 'SKU create', 'value': str(memory.get('skuCode', 'new'))})

        if memory.get('sizeLabels'):
            size_label = str(memory['sizeLabels'][0])
            size_payload = {
                'sizeLabel': size_label,
                'barcode': str(memory.get('barcode') or f'AUTO-{size_label}'),
                'unitOfMeasure': 'unit',
                'packSize': 1,
                'status': memory.get('status', 'active'),
            }
            if memory.get('existingSizeId'):
                size_ops.append({'op': 'update', 'sizeId': memory['existingSizeId'], 'payload': size_payload})
                preview_entities.append({'label': 'Size update', 'value': size_label})
            else:
                size_ops.append({'op': 'create', 'skuCode': memory.get('skuCode'), 'payload': size_payload})
                preview_entities.append({'label': 'Size create', 'value': size_label})

        if memory.get('locationId'):
            location_ops.append(
                {
                    'payload': {
                        'locationId': memory['locationId'],
                        'isEnabled': True,
                        'pickupEnabled': bool(memory.get('pickupEnabled', False)),
                    }
                }
            )
            preview_entities.append({'label': 'Location', 'value': str(memory.get('locationLabel', ''))})

        return {
            'productId': memory['productId'],
            'productPatch': product_patch,
            'skuOps': sku_ops,
            'sizeOps': size_ops,
            'locationOps': location_ops,
            'previewEntities': preview_entities,
        }

    async def _hydrate_existing_ids(self, auth: AuthContext, memory: dict[str, object]) -> None:
        product_id = str(memory.get('productId') or '')
        if not product_id:
            return

        detail = await self._backend.get_product(auth.access_token or '', auth.tenant_id, product_id)
        sku_code = str(memory.get('skuCode') or '')
        if sku_code:
            for sku in detail.get('skus', []):
                if isinstance(sku, dict) and str(sku.get('sku_code') or '').upper() == sku_code.upper():
                    memory['existingSkuId'] = str(sku.get('id'))
                    break
        if memory.get('existingSkuId') and memory.get('sizeLabels'):
            size_label = str(memory['sizeLabels'][0]).upper()
            for size in detail.get('sizes', []):
                if (
                    isinstance(size, dict)
                    and str(size.get('sku_id')) == str(memory.get('existingSkuId'))
                    and str(size.get('size_label') or '').upper() == size_label
                ):
                    memory['existingSizeId'] = str(size.get('id'))
                    break

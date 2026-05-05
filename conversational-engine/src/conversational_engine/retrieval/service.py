from __future__ import annotations

from hashlib import sha256
from math import sqrt
from pathlib import Path
from uuid import uuid4

from conversational_engine.ai.mongo_repository import SYSTEM_TENANT_ID
from conversational_engine.ai.repository import AIRepository
from conversational_engine.retrieval.navigation_targets import NAVIGATION_TARGETS


def _normalize(text: str) -> str:
    return ''.join(char.lower() if char.isalnum() else ' ' for char in text).strip()


def _tokens(text: str) -> list[str]:
    return [token for token in _normalize(text).split() if token]


def _embed(text: str, dimensions: int = 64) -> list[float]:
    vector = [0.0] * dimensions
    for token in _tokens(text):
        digest = sha256(token.encode('utf-8')).digest()
        index = digest[0] % dimensions
        sign = 1.0 if digest[1] % 2 == 0 else -1.0
        vector[index] += sign
    magnitude = sqrt(sum(value * value for value in vector)) or 1.0
    return [value / magnitude for value in vector]


def _cosine(left: list[float], right: list[float]) -> float:
    try:
        return sum(a * b for a, b in zip(left, right, strict=True))
    except ValueError as exc:
        raise ValueError('Embedding vectors must have the same length for cosine similarity.') from exc


def _chunks(content: str) -> list[str]:
    paragraphs = [part.strip() for part in content.split('\n\n') if part.strip()]
    return paragraphs or [content.strip()]


class RetrievalService:
    def __init__(self, repository: AIRepository) -> None:
        self._repository = repository
        self._docs_dir = Path(__file__).resolve().parents[3] / 'docs' / 'help'

    async def ensure_ingested(self) -> None:
        if not self._docs_dir.exists():
            return
        db = getattr(self._repository, 'database', None)
        if db is None:
            return
        for doc_path in sorted(self._docs_dir.glob('*.md')):
            source_key = doc_path.name
            title = doc_path.stem.replace('-', ' ').title()
            content = doc_path.read_text(encoding='utf-8').strip()
            now_doc = {
                '_id': source_key,
                'tenantId': SYSTEM_TENANT_ID,
                'sourceKey': source_key,
                'title': title,
                'documentType': 'help_markdown',
                'status': 'active',
                'metadata': {'path': str(doc_path)},
            }
            await db.ai_help_documents.update_one(
                {'tenantId': SYSTEM_TENANT_ID, 'sourceKey': source_key},
                {'$set': now_doc},
                upsert=True,
            )
            document = await db.ai_help_documents.find_one({'tenantId': SYSTEM_TENANT_ID, 'sourceKey': source_key})
            if document is None:
                continue
            await db.ai_help_chunks.delete_many({'tenantId': SYSTEM_TENANT_ID, 'documentId': document['_id']})
            if not content:
                continue
            chunks = []
            for index, chunk in enumerate(_chunks(content)):
                chunks.append(
                    {
                        '_id': str(uuid4()),
                        'tenantId': SYSTEM_TENANT_ID,
                        'documentId': document['_id'],
                        'chunkIndex': index,
                        'content': chunk,
                        'embedding': _embed(chunk),
                        'metadata': {'sourceKey': source_key, 'title': title},
                    }
                )
            if chunks:
                await db.ai_help_chunks.insert_many(chunks)

    async def search(self, query: str) -> list[dict[str, object]]:
        await self.ensure_ingested()
        db = getattr(self._repository, 'database', None)
        if db is None:
            return []
        rows = await db.ai_help_chunks.find({'tenantId': SYSTEM_TENANT_ID}).sort('chunkIndex', 1).limit(200).to_list(length=200)
        query_embedding = _embed(query)
        scored: list[dict[str, object]] = []
        for row in rows:
            embedding = row.get('embedding')
            if not isinstance(embedding, list):
                continue
            score = _cosine(query_embedding, [float(value) for value in embedding])
            scored.append(
                {
                    'title': row.get('metadata', {}).get('title', ''),
                    'sourceKey': row.get('metadata', {}).get('sourceKey', ''),
                    'content': row['content'],
                    'score': score,
                }
            )
        scored.sort(key=lambda item: float(item['score']), reverse=True)
        return scored[:3]

    async def resolve_navigation(self, query: str) -> list[dict[str, object]]:
        normalized_query = _normalize(query)
        query_tokens = set(_tokens(query))
        candidates: list[dict[str, object]] = []

        for target in NAVIGATION_TARGETS:
            corpus = ' '.join([target['label'], target['description'], *target.get('keywords', [])])
            corpus_tokens = set(_tokens(corpus))
            score = 0
            if normalized_query and normalized_query in _normalize(corpus):
                score += 5
            score += len(query_tokens & corpus_tokens) * 3
            if score <= 0:
                continue
            candidates.append(
                {
                    'label': target['label'],
                    'href': target['href'],
                    'description': target['description'],
                    'score': score,
                }
            )

        candidates.sort(key=lambda item: int(item['score']), reverse=True)
        return candidates[:3]

    async def search_with_navigation(self, query: str) -> dict[str, list[dict[str, object]]]:
        return {
            'docs': await self.search(query),
            'routes': await self.resolve_navigation(query),
        }

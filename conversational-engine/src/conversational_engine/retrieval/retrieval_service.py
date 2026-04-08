from __future__ import annotations

from hashlib import sha256
from math import sqrt
from pathlib import Path
from uuid import uuid4

from psycopg import connect
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

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
    return sum(a * b for a, b in zip(left, right, strict=False))


def _chunks(content: str) -> list[str]:
    paragraphs = [part.strip() for part in content.split('\n\n') if part.strip()]
    return paragraphs or [content.strip()]


class RetrievalService:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url
        self._docs_dir = Path(__file__).resolve().parents[3] / 'docs' / 'help'

    def _connection(self):
        return connect(self._database_url, row_factory=dict_row)

    async def ensure_ingested(self) -> None:
        if not self._docs_dir.exists():
            return

        with self._connection() as conn, conn.cursor() as cur:
            for doc_path in sorted(self._docs_dir.glob('*.md')):
                source_key = doc_path.name
                title = doc_path.stem.replace('-', ' ').title()
                content = doc_path.read_text(encoding='utf-8').strip()
                document = cur.execute(
                    """
                    INSERT INTO ai_help_documents (id, source_key, title, document_type, metadata)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (source_key)
                    DO UPDATE SET title = EXCLUDED.title, updated_at = now()
                    RETURNING id
                    """,
                    (
                        uuid4(),
                        source_key,
                        title,
                        'help_markdown',
                        Jsonb({'path': str(doc_path)}),
                    ),
                ).fetchone()
                document_id = document['id']
                cur.execute('DELETE FROM ai_help_chunks WHERE document_id = %s', (document_id,))

                for index, chunk in enumerate(_chunks(content)):
                    cur.execute(
                        """
                        INSERT INTO ai_help_chunks (id, document_id, chunk_index, content, embedding, metadata)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (
                            uuid4(),
                            document_id,
                            index,
                            chunk,
                            Jsonb(_embed(chunk)),
                            Jsonb({'sourceKey': source_key}),
                        ),
                    )

            conn.commit()

    async def search(self, query: str) -> list[dict[str, object]]:
        await self.ensure_ingested()
        query_embedding = _embed(query)

        with self._connection() as conn, conn.cursor() as cur:
            rows = cur.execute(
                """
                SELECT
                  d.title,
                  d.source_key,
                  c.content,
                  c.embedding
                FROM ai_help_chunks c
                JOIN ai_help_documents d ON d.id = c.document_id
                ORDER BY c.created_at DESC
                LIMIT 200
                """
            ).fetchall()

        scored: list[dict[str, object]] = []
        for row in rows:
            embedding = row.get('embedding')
            if not isinstance(embedding, list):
                continue
            score = _cosine(query_embedding, [float(value) for value in embedding])
            scored.append(
                {
                    'title': row['title'],
                    'sourceKey': row['source_key'],
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

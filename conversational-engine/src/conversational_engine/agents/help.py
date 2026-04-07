from __future__ import annotations

from conversational_engine.agents.base import Agent
from conversational_engine.agents.types import AgentTurnResult
from conversational_engine.config.model_routing import ModelRouting
from conversational_engine.contracts.auth import AuthContext
from conversational_engine.contracts.common import ConversationDetail, NavigationBlock, TextBlock, WorkflowState
from conversational_engine.providers.base import ChatProvider, ProviderMessage
from conversational_engine.providers.json_schema import nullable, strict_object_schema, string_schema
from conversational_engine.retrieval.service import RetrievalService

HELP_EXTRACTION_SCHEMA = strict_object_schema(
    properties={
        'query': nullable(string_schema()),
    }
)


class HelpAgent(Agent):
    name = 'help'

    def __init__(
        self,
        *,
        retrieval: RetrievalService,
        chat_provider: ChatProvider | None,
        routing: ModelRouting,
    ) -> None:
        self._retrieval = retrieval
        self._chat_provider = chat_provider
        self._routing = routing

    def can_handle(self, intent: str) -> bool:
        return intent == 'navigation_help'

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
        del conversation, workflow, intent, memory
        query = user_message.strip()

        if self._chat_provider:
            model = self._routing.model_for(agent_name=self.name, task='extract')
            try:
                extraction = await self._chat_provider.complete_json(
                    model=model,
                    messages=[
                        ProviderMessage(
                            role='system',
                            content='Extract the user navigation/help query as-is.',
                        ),
                        ProviderMessage(role='user', content=user_message),
                    ],
                    json_schema=HELP_EXTRACTION_SCHEMA,
                    max_tokens=120,
                )
                extracted_query = extraction.get('query')
                if isinstance(extracted_query, str) and extracted_query.strip():
                    query = extracted_query.strip()
            except Exception:
                pass

        results = await self._retrieval.search_with_navigation(query)
        docs = results.get('docs', [])
        routes = results.get('routes', [])

        blocks = []
        if docs:
            blocks.append(TextBlock(content=str(docs[0].get('content') or '')))
        else:
            blocks.append(TextBlock(content='No help documentation matched that query yet.'))

        for route in routes:
            blocks.append(
                NavigationBlock(
                    label=str(route.get('label', 'Open screen')),
                    href=str(route.get('href', '/')),
                    description=str(route.get('description', '')),
                )
            )

        return AgentTurnResult(next_action='return_read_result', blocks=blocks)

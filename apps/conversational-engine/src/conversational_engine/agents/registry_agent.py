from __future__ import annotations

from conversational_engine.agents.base_agent import Agent


class AgentRegistry:
    def __init__(self, agents: list[Agent] | None = None) -> None:
        self._agents = agents or []

    def register(self, agent: Agent) -> None:
        self._agents.append(agent)

    def resolve(self, intent: str) -> Agent | None:
        for agent in self._agents:
            if agent.can_handle(intent):
                return agent
        return None

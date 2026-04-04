from __future__ import annotations

from dataclasses import dataclass

from conversational_engine.config.settings import Settings

MODEL_TIER_BEST = 'best'
MODEL_TIER_OK = 'ok'

SUPPORTED_TASKS = {'extract', 'summarize', 'classify'}


def _parse_agent_tiers(raw: str) -> dict[str, str]:
    tiers: dict[str, str] = {}
    if not raw:
        return tiers
    for segment in raw.split(','):
        segment = segment.strip()
        if not segment or ':' not in segment:
            continue
        agent, tier = [part.strip() for part in segment.split(':', 1)]
        if not agent:
            continue
        tier = tier.lower()
        if tier not in {MODEL_TIER_BEST, MODEL_TIER_OK}:
            continue
        tiers[agent] = tier
    return tiers


@dataclass(frozen=True, slots=True)
class ModelRouting:
    model_best: str
    model_ok: str
    agent_tiers: dict[str, str]

    @classmethod
    def from_settings(cls, settings: Settings) -> ModelRouting:
        default_tiers = {
            'products': MODEL_TIER_BEST,
            'purchasing': MODEL_TIER_BEST,
            'inventory': MODEL_TIER_OK,
            'reporting': MODEL_TIER_OK,
            'help': MODEL_TIER_OK,
            'orchestrator_classifier': MODEL_TIER_OK,
        }
        overrides = _parse_agent_tiers(settings.agent_model_tiers)
        return cls(
            model_best=settings.model_best,
            model_ok=settings.model_ok,
            agent_tiers={**default_tiers, **overrides},
        )

    def model_for(self, *, agent_name: str, task: str) -> str:
        if task not in SUPPORTED_TASKS:
            raise ValueError(f'Unsupported model routing task: {task}')
        tier = self.agent_tiers.get(agent_name, MODEL_TIER_OK)
        return self.model_best if tier == MODEL_TIER_BEST else self.model_ok


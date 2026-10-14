"""Token accounting for the Chroma Sync AI service.

Every LLM call made while serving a request is recorded into a request-scoped
accumulator held in a :class:`contextvars.ContextVar`. Starlette runs each
request in its own asyncio task, so the context is naturally per-request and
concurrent requests cannot contaminate each other's totals.

This lets the service meter real token usage without threading a usage object
through every service function signature.
"""

from __future__ import annotations

import logging
import os
from contextvars import ContextVar, Token
from dataclasses import dataclass, field

log = logging.getLogger("chroma-ai.usage")

# Price per 1M tokens (input, output) in USD.
PRICE_PER_1M: dict[str, tuple[float, float]] = {
    # OpenAI / LLMaaS gateway
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-5-mini": (0.25, 2.00),
    "gpt-5-nano": (0.05, 0.40),
    # Anthropic
    "claude-3-5-sonnet-latest": (3.00, 15.00),
    "claude-3-5-haiku-latest": (0.80, 4.00),
    # Groq
    "qwen/qwen3.6-27b": (0.15, 0.60),
    "llama-3.3-70b-versatile": (0.59, 0.79),
    # Offline
    "mock": (0.0, 0.0),
}

# Used when a model is not in the table, so an unknown model is never free.
_FALLBACK_PRICE: tuple[float, float] = (1.00, 3.00)

# Rough character-per-token ratio, used only when a provider omits usage data.
_CHARS_PER_TOKEN = 4


def price_for(model: str) -> tuple[float, float]:
    return PRICE_PER_1M.get(model, _FALLBACK_PRICE)


def estimate_tokens(text: str) -> int:
    """Cheap token estimate for providers that do not report usage."""
    if not text:
        return 0
    return max(1, len(text) // _CHARS_PER_TOKEN)


def cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    in_price, out_price = price_for(model)
    return (prompt_tokens * in_price + completion_tokens * out_price) / 1_000_000


@dataclass
class LlmCall:
    model: str
    prompt_tokens: int
    completion_tokens: int
    estimated: bool
    cost_usd: float


@dataclass
class UsageAccumulator:
    """Totals for every LLM call made while serving one request."""

    feature: str = "unknown"
    calls: list[LlmCall] = field(default_factory=list)

    def add(self, model: str, prompt_tokens: int, completion_tokens: int, *, estimated: bool) -> None:
        prompt_tokens = max(0, int(prompt_tokens))
        completion_tokens = max(0, int(completion_tokens))
        self.calls.append(
            LlmCall(
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                estimated=estimated,
                cost_usd=cost_usd(model, prompt_tokens, completion_tokens),
            )
        )

    @property
    def prompt_tokens(self) -> int:
        return sum(c.prompt_tokens for c in self.calls)

    @property
    def completion_tokens(self) -> int:
        return sum(c.completion_tokens for c in self.calls)

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    @property
    def total_cost_usd(self) -> float:
        return sum(c.cost_usd for c in self.calls)

    @property
    def model(self) -> str:
        return self.calls[-1].model if self.calls else "none"

    @property
    def estimated(self) -> bool:
        return any(c.estimated for c in self.calls)


_current: ContextVar[UsageAccumulator | None] = ContextVar("chroma_ai_usage", default=None)


def begin(feature: str) -> tuple[UsageAccumulator, Token]:
    acc = UsageAccumulator(feature=feature)
    return acc, _current.set(acc)


def end(token: Token) -> None:
    _current.reset(token)


def current() -> UsageAccumulator | None:
    return _current.get()


class BudgetExceededError(RuntimeError):
    """Raised when the service-wide LLM spend cap has been reached."""


class _GlobalBudget:
    """Service-wide spend cap.

    Seeded at startup from the persisted ledger (``ai_total_spend_usd()``) so a
    restart cannot silently hand the service a fresh budget, then maintained in
    process for the rest of the run. If the ledger is unreachable the counter
    starts at zero and the cap degrades to a per-process backstop.
    """

    def __init__(self) -> None:
        self._spent_usd = 0.0
        self._warned_80 = False
        self._tripped = False

    @property
    def spent_usd(self) -> float:
        return self._spent_usd

    def seed(self, spent_usd: float) -> None:
        """Adopt the already-recorded spend. Only ever raises the counter."""
        if spent_usd <= self._spent_usd:
            return
        self._spent_usd = spent_usd
        limit = self._limit()
        self._tripped = spent_usd >= limit
        self._warned_80 = spent_usd >= limit * 0.8
        log.info(
            "LLM spend restored from ledger: $%.4f of the $%.2f cap", spent_usd, limit
        )

    def _limit(self) -> float:
        raw = os.environ.get("AI_BUDGET_USD") or os.environ.get("LLMAAS_BUDGET_USD") or "15"
        try:
            return float(raw)
        except ValueError:
            log.warning("invalid AI_BUDGET_USD=%r, falling back to 15", raw)
            return 15.0

    def _enforced(self) -> bool:
        return os.environ.get("AI_ENFORCE_BUDGET", "true").strip().lower() in {"1", "true", "yes"}

    def check(self) -> None:
        """Raise before making a call if the cap is already reached."""
        if self._tripped and self._enforced():
            raise BudgetExceededError(
                f"LLM spend cap of ${self._limit():.2f} reached; AI features are paused."
            )

    def record(self, model: str, prompt_tokens: int, completion_tokens: int) -> None:
        self._spent_usd += cost_usd(model, prompt_tokens, completion_tokens)
        limit = self._limit()
        if not self._tripped and self._spent_usd >= limit:
            self._tripped = True
            log.error(
                "LLM spend $%.4f reached the $%.2f cap - further calls %s",
                self._spent_usd,
                limit,
                "will be refused" if self._enforced() else "will continue (enforcement off)",
            )
        elif not self._warned_80 and self._spent_usd >= limit * 0.8:
            self._warned_80 = True
            log.warning("LLM spend $%.4f reached 80%% of the $%.2f cap", self._spent_usd, limit)


budget = _GlobalBudget()


def record_call(
    model: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    *,
    prompt_text: str = "",
    completion_text: str = "",
) -> None:
    """Record one LLM call against the request accumulator and global budget.

    Providers that omit usage data are estimated from text length so a request
    is never metered as free.
    """
    estimated = prompt_tokens is None or completion_tokens is None
    if prompt_tokens is None:
        prompt_tokens = estimate_tokens(prompt_text)
    if completion_tokens is None:
        completion_tokens = estimate_tokens(completion_text)

    budget.record(model, prompt_tokens, completion_tokens)
    acc = _current.get()
    if acc is not None:
        acc.add(model, prompt_tokens, completion_tokens, estimated=estimated)

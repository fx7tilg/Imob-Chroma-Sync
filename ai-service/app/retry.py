"""Retry pacing for LLM calls.

An immediate retry after a transient provider failure usually hits the same
condition and adds load. Jitter is included because synchronised retries from
concurrent requests would otherwise arrive together.

Quota and budget errors are deliberately *not* retried anywhere - they require
action, not patience, so they propagate on the first failure.
"""

from __future__ import annotations

import asyncio
import random

_BASE_DELAY_S = 0.4
_MAX_DELAY_S = 4.0


async def backoff(attempt: int) -> None:
    """Sleep before retry `attempt` + 1, with full jitter."""
    ceiling = min(_BASE_DELAY_S * (2 ** (attempt - 1)), _MAX_DELAY_S)
    await asyncio.sleep(random.uniform(0, ceiling))

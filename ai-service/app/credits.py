"""Server-enforced per-user AI credits.

The frontend used to track AI usage in ``localStorage``, which meant the limit
was advisory: clearing site data reset it and the backend never checked it.
Credits now live in Postgres and are enforced here, before any provider call.

Flow per request (the pattern commercial AI APIs use):

1. **Reserve** an estimated token cost. This is what makes concurrent requests
   safe - the reservation is written inside a row-locked transaction, so two
   parallel calls cannot both pass a check against the same stale balance.
2. Run the request, accumulating real usage via :mod:`app.usage`.
3. **Settle** with the actual token counts, or mark the attempt failed so the
   user is not billed for an outage.

Reserve runs as the caller (so ``auth.uid()`` and RLS apply); settle runs with
the service role because it must write the ledger after the fact.
"""

from __future__ import annotations

import logging
import os

import httpx
from fastapi import Depends, HTTPException, Response

from .security import IS_PRODUCTION, Caller, require_caller
from . import usage

log = logging.getLogger("chroma-ai.credits")

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# PostgREST maps a PT-prefixed SQLSTATE to the HTTP status in its last 3 chars,
# so ai_reserve_credits raising PT429 surfaces here as a 429.
QUOTA_SQLSTATE = "PT429"

_RPC_TIMEOUT_S = float(os.environ.get("AI_CREDITS_TIMEOUT_S", "8"))

# Tokens assumed for a request before the provider reports anything. Deliberately
# generous: an under-estimate would let a user slip past the cap, and settle
# corrects it downwards moments later anyway.
_DEFAULT_ESTIMATE = int(os.environ.get("AI_ESTIMATE_TOKENS", "2500"))

CREDITS_ENABLED = bool(SUPABASE_URL and SERVICE_ROLE_KEY)

if not CREDITS_ENABLED:
    if IS_PRODUCTION:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production "
            "so AI credits can be enforced."
        )
    log.warning(
        "AI credits disabled: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. "
        "Usage is metered but not limited."
    )


class QuotaExceeded(Exception):
    """The caller has used their allowance for the current UTC day."""

    def __init__(self, balance: dict) -> None:
        super().__init__("AI allowance exhausted")
        self.balance = balance


async def _rpc(client: httpx.AsyncClient, fn: str, payload: dict, token: str) -> object:
    r = await client.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{fn}",
        json=payload,
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "authorization": f"Bearer {token}",
            "content-type": "application/json",
        },
        timeout=_RPC_TIMEOUT_S,
    )
    if r.status_code >= 400:
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if isinstance(body, dict) and body.get("code") == QUOTA_SQLSTATE:
            raise QuotaExceeded(_balance_from_detail(body.get("details")))
        raise RuntimeError(f"{fn} failed: {r.status_code} {r.text[:200]}")
    return r.json()


def _balance_from_detail(detail) -> dict:
    import json

    if isinstance(detail, dict):
        return detail
    if isinstance(detail, str):
        try:
            return json.loads(detail)
        except ValueError:
            pass
    return {}


async def reserve(caller: Caller, feature: str) -> tuple[str | None, dict]:
    """Reserve an estimate. Returns (request_id, balance).

    Runs as the service role: the ledger functions are not granted to
    `authenticated` so a browser cannot credit itself. The caller's identity has
    already been proven by the JWT check in :mod:`app.security`.
    """
    if not CREDITS_ENABLED:
        return None, {}
    async with httpx.AsyncClient() as client:
        data = await _rpc(
            client,
            "ai_reserve_credits",
            {
                "p_user": caller.subject,
                "p_feature": feature,
                "p_estimated_tokens": _DEFAULT_ESTIMATE,
            },
            SERVICE_ROLE_KEY,
        )
    if not isinstance(data, dict):
        return None, {}
    return data.get("request_id"), data.get("balance") or {}


async def settle(request_id: str, acc: usage.UsageAccumulator, status: str) -> dict:
    """Write back real token usage. Never raises - settling must not fail a response."""
    if not CREDITS_ENABLED or not request_id:
        return {}
    try:
        async with httpx.AsyncClient() as client:
            data = await _rpc(
                client,
                "ai_settle_credits",
                {
                    "p_request_id": request_id,
                    "p_prompt_tokens": acc.prompt_tokens,
                    "p_completion_tokens": acc.completion_tokens,
                    "p_cost_usd": round(acc.total_cost_usd, 6),
                    "p_model": acc.model,
                    "p_status": status,
                },
                SERVICE_ROLE_KEY,
            )
        if isinstance(data, dict):
            return data.get("balance") or {}
    except Exception as e:  # noqa: BLE001 - a settle failure must not break the response
        log.error("ai_settle_credits failed for %s: %s", request_id, e)
    return {}


def apply_headers(response: Response, balance: dict) -> None:
    """Expose the remaining allowance the way AI providers do, via headers."""
    if not balance:
        return
    mapping = {
        "X-AI-Credits-Limit": balance.get("token_limit"),
        "X-AI-Credits-Remaining": balance.get("tokens_remaining"),
        "X-AI-Credits-Used": balance.get("tokens_used"),
        "X-AI-Requests-Remaining": balance.get("requests_remaining"),
        "X-AI-Credits-Reset": balance.get("resets_at"),
    }
    for key, value in mapping.items():
        if value is not None:
            response.headers[key] = str(value)


def quota_response(balance: dict) -> HTTPException:
    """429 without Retry-After: this is a spend cap, not a rate limit, so
    retrying before the daily reset cannot succeed."""
    return HTTPException(
        status_code=429,
        detail={
            "error_code": "ai_allowance_exhausted",
            "message": "You've used your AI allowance for today. It resets at midnight UTC.",
            "balance": balance,
        },
    )


class Meter:
    """Scopes one request's token accounting and settles it on exit.

    Used as ``async with meter:`` inside the endpoint rather than as a
    dependency teardown, because FastAPI runs ``yield`` teardown after the
    response has been sent - too late to attach credit headers.
    """

    def __init__(self, feature: str, request_id: str | None, response: Response, balance: dict) -> None:
        self._feature = feature
        self._request_id = request_id
        self._response = response
        self._balance = balance
        self._token = None
        self.acc: usage.UsageAccumulator | None = None

    async def __aenter__(self) -> "Meter":
        self.acc, self._token = usage.begin(self._feature)
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        acc = self.acc
        if self._token is not None:
            usage.end(self._token)
        if acc is not None:
            log.info(
                "ai usage feature=%s model=%s tokens=%d cost=$%.5f estimated=%s",
                self._feature, acc.model, acc.total_tokens, acc.total_cost_usd, acc.estimated,
            )
            if self._request_id:
                # Charge nothing for a failed call - the user got no answer.
                settled = await settle(self._request_id, acc, "failed" if exc_type else "completed")
                if settled:
                    self._balance = settled
        apply_headers(self._response, self._balance)
        return False  # never swallow the exception


def metered(feature: str):
    """Dependency factory: reserves credits up front, yields a :class:`Meter`."""

    async def dependency(response: Response, caller: Caller = Depends(require_caller)) -> Meter:
        # Edge Functions call with the service role on a user's behalf; they are
        # metered for cost visibility but not capped, as there is no end user to bill.
        if caller.is_service or not CREDITS_ENABLED:
            return Meter(feature, None, response, {})
        try:
            request_id, balance = await reserve(caller, feature)
        except QuotaExceeded as e:
            raise quota_response(e.balance) from None
        except Exception as e:  # noqa: BLE001
            # A credit-ledger outage must not take AI features down with it;
            # usage is still recorded locally and against the global spend cap.
            log.error("credit reservation failed, allowing request: %s", e)
            return Meter(feature, None, response, {})
        return Meter(feature, request_id, response, balance)

    return dependency

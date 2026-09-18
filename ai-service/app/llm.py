"""LLM client abstraction - swap provider via env, no code change needed."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Protocol

log = logging.getLogger("chroma-ai.llm")

# Price per 1M tokens (input, output), USD. Only models we actually use need an entry.
_PRICE_PER_1M: dict[str, tuple[float, float]] = {
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-5-mini": (0.25, 2.00),
    "gpt-5-nano": (0.05, 0.40),
    "gpt-4.1-nano": (0.10, 0.40),
}


class _CostTracker:
    """In-memory, log-only budget guard - resets on process restart."""

    def __init__(self) -> None:
        self._spent_usd = 0.0
        self._warned_80 = False
        self._warned_100 = False

    def record(self, model: str, prompt_tokens: int, completion_tokens: int) -> None:
        in_price, out_price = _PRICE_PER_1M.get(model, (0.0, 0.0))
        self._spent_usd += (prompt_tokens * in_price + completion_tokens * out_price) / 1_000_000
        budget = float(os.environ.get("LLMAAS_BUDGET_USD", "15"))
        if not self._warned_100 and self._spent_usd >= budget:
            self._warned_100 = True
            log.warning("LLMaaS spend $%.4f has reached the $%.2f budget", self._spent_usd, budget)
        elif not self._warned_80 and self._spent_usd >= budget * 0.8:
            self._warned_80 = True
            log.warning("LLMaaS spend $%.4f has reached 80%% of the $%.2f budget", self._spent_usd, budget)


_cost_tracker = _CostTracker()


class LlmClient(Protocol):
    async def complete_json(self, system: str, user: str) -> str: ...
    async def complete_text(self, system: str, user: str) -> str: ...


class MockClient:
    """Deterministic client for tests + offline demos.

    Analyses the input data to return *context-aware* ratings rather than
    a flat yellow every time - much more useful for local testing.
    """

    @staticmethod
    def _mock_chat_reply(text: str, team: str | None) -> str:
        """Keyword-matched guidance so the assistant works with no LLM key."""
        who = f"As {team.title()}, " if team else ""
        if any(k in text for k in ("create", "new decision", "start", "add decision")):
            return (
                "Only the Design team creates decisions. Go to Decisions → New Decision, "
                "fill in the colour code, material, finish and the temp/UV/chemical "
                "requirements, then set the design status to 'Ready for Engineering' to submit."
            )
        if any(k in text for k in ("approve", "sign off", "review", "reject")):
            return (
                who
                + "open the decision and use the approval panel. Approvals go in order - "
                "Engineering, then Procurement, then Quality - and only Quality gives final approval. "
                "A rejection sends it back to Design with your notes."
            )
        if any(k in text for k in ("rating", "green", "yellow", "red", "readiness")):
            return (
                "The AI readiness rating is advisory: green = ready to advance, "
                "yellow = usable but incomplete or validations pending, red = a hard blocker "
                "like a missing field, failed validation, rejection or conflict."
            )
        if "conflict" in text:
            return (
                "Conflicts are detected across decisions in the same business area - for example "
                "the same colour code with incompatible gloss. Open the Conflicts page to review "
                "them; unresolved conflicts block Quality from approving."
            )
        if any(k in text for k in ("report", "meldeliste", "colour-mix", "colour mix", "export")):
            return (
                "Reports build from approved decisions: Meldeliste (Excel) and the Colour-Mix-Chart "
                "(PDF swatches). Find them under Reports in the sidebar."
            )
        if any(k in text for k in ("version", "resubmit", "rejected")):
            return (
                "When a decision is rejected it returns to Design. Fix the flagged fields and "
                "resubmit - the version increments and all downstream approvals reset for a fresh review."
            )
        return (
            "I can guide you through Chroma Sync - creating and submitting decisions, the "
            "Design → Engineering → Procurement → Quality approval flow, AI readiness ratings, "
            "conflicts, and reports. What would you like to do?"
        )

    async def complete_json(self, system: str, user: str) -> str:  # noqa: ARG002
        low = user.lower()

        # ── Chat assistant ──
        if '"chat": true' in low or '"chat":true' in low:
            try:
                data = json.loads(user)
                messages = data.get("messages", [])
                last = ""
                for m in reversed(messages):
                    if m.get("role") == "user":
                        last = (m.get("content") or "").lower()
                        break
                team = data.get("user_team")
                reply = self._mock_chat_reply(last, team)
                return json.dumps({"reply": reply})
            except (json.JSONDecodeError, KeyError):
                return json.dumps({"reply": "I'm the Chroma Sync assistant - ask me about creating, reviewing or approving a decision."})

        # ── Conflicts endpoint ──
        if "conflict" in low and "decisions" in low:
            # Parse out decision data and look for duplicate colour_codes
            try:
                data = json.loads(user)
                decisions = data.get("decisions", [])
                conflicts = []
                colour_map: dict[str, list[str]] = {}
                for d in decisions:
                    cc = d.get("colour_code")
                    if cc:
                        colour_map.setdefault(cc, []).append(d.get("id", ""))
                for cc, ids in colour_map.items():
                    if len(ids) >= 2:
                        conflicts.append({
                            "decision_a_id": ids[0],
                            "decision_b_id": ids[1],
                            "conflict_type": "duplicate_colour_code",
                            "explanation": (
                                f"Both decisions use colour code {cc} in the "
                                "same business area - potential unintended duplication."
                            ),
                        })
                return json.dumps({"conflicts": conflicts})
            except (json.JSONDecodeError, KeyError):
                return json.dumps({"conflicts": []})

        # ── Summary endpoint ──
        if "summar" in low:
            try:
                data = json.loads(user)
                decisions = data.get("decisions", [])
                summaries = []
                for d in decisions:
                    comp = d.get("component_name", "Component")
                    cc = d.get("colour_code") or "n/a"
                    mat = d.get("material_reference") or "n/a"
                    status = d.get("status", "unknown")
                    summaries.append({
                        "id": d.get("id", ""),
                        "summary": (
                            f"{comp}: colour {cc}, material {mat}, "
                            f"currently {status.replace('_', ' ')}."
                        ),
                    })
                return json.dumps({"summaries": summaries})
            except (json.JSONDecodeError, KeyError):
                return json.dumps({"summaries": []})

        # ── Readiness endpoint - context-aware rating ──
        try:
            data = json.loads(user)
            decision = data.get("decision", {})
            approvals = data.get("approvals", [])
            material = data.get("material")

            missing: list[str] = []
            flags: list[dict] = []

            if not decision.get("colour_code"):
                missing.append("colour_code")
                flags.append({"flag": "missing_colour_code"})
            if not decision.get("material_reference"):
                missing.append("material_reference")
                flags.append({"flag": "missing_material_reference"})

            # Check engineering & procurement inputs
            if not decision.get("feasibility_status"):
                flags.append({"flag": "no_feasibility_status", "detail": "Engineering has not assessed feasibility"})
            if not decision.get("supplier"):
                flags.append({"flag": "no_supplier", "detail": "Procurement has not assigned a supplier"})

            # Check material compatibility
            if material:
                compat = material.get("compatibility_notes", "") or ""
                if "caution" in compat.lower() or "warning" in compat.lower():
                    flags.append({"flag": "material_compatibility_warning", "detail": compat})

            # Check approvals
            approval_map = {a.get("team"): a.get("status") for a in approvals}
            pending_teams = [
                t for t in ("design", "engineering", "procurement", "quality")
                if approval_map.get(t, "pending") == "pending"
            ]
            rejected_teams = [
                t for t in ("design", "engineering", "procurement", "quality")
                if approval_map.get(t) == "rejected"
            ]

            if rejected_teams:
                flags.append({"flag": "team_rejected", "detail": f"Rejected by: {', '.join(rejected_teams)}"})

            # Check role decisions for rejections
            if decision.get("engineering_decision") == "REJECTED":
                flags.append({"flag": "engineering_rejected", "detail": "Engineering has rejected this decision"})
                rejected_teams.append("engineering") if "engineering" not in rejected_teams else None
            if decision.get("procurement_decision") == "REJECTED":
                flags.append({"flag": "procurement_rejected", "detail": "Procurement has rejected this decision"})
                rejected_teams.append("procurement") if "procurement" not in rejected_teams else None
            if decision.get("quality_decision") == "REJECTED":
                flags.append({"flag": "quality_rejected", "detail": "Quality has rejected this decision"})
                rejected_teams.append("quality") if "quality" not in rejected_teams else None

            # Rate
            if missing or rejected_teams:
                rating = "red"
                parts = []
                if missing:
                    parts.append(f"Missing required field(s): {', '.join(missing)}.")
                if rejected_teams:
                    parts.append(f"Rejected by {', '.join(rejected_teams)}.")
                reason = " ".join(parts) + " Decision is blocked."
            elif pending_teams or not decision.get("feasibility_status") or not decision.get("supplier"):
                rating = "yellow"
                issues = []
                if pending_teams:
                    issues.append(f"approvals pending from {', '.join(pending_teams)}")
                if not decision.get("feasibility_status"):
                    issues.append("no feasibility assessment")
                if not decision.get("supplier"):
                    issues.append("no supplier assigned")
                reason = f"Usable but incomplete: {'; '.join(issues)}."
            else:
                rating = "green"
                reason = "All required fields present, all teams have decided. Ready to advance."
                flags.append({"flag": "ai_fallback"})

            return json.dumps({"rating": rating, "reason": reason, "flags": flags})
        except (json.JSONDecodeError, KeyError):
            pass

        return json.dumps(
            {
                "rating": "yellow",
                "reason": "Mock LLM response - configure a real provider for production checks.",
                "flags": [{"flag": "ai_fallback"}],
            }
        )

    async def complete_text(self, system: str, user: str) -> str:
        return "This is a mock text response from MockClient."


class OpenAIClient:
    def __init__(self) -> None:
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
        self._model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    async def complete_json(self, system: str, user: str) -> str:
        r = await self._client.chat.completions.create(
            model=self._model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return r.choices[0].message.content or "{}"

    async def complete_text(self, system: str, user: str) -> str:
        r = await self._client.chat.completions.create(
            model=self._model,
            temperature=0.7,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return r.choices[0].message.content or ""


class AnthropicClient:
    def __init__(self) -> None:
        from anthropic import AsyncAnthropic

        self._client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self._model = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")

    async def complete_json(self, system: str, user: str) -> str:
        # Anthropic returns free text; we ask hard for JSON in the system prompt.
        r = await self._client.messages.create(
            model=self._model,
            max_tokens=1024,
            temperature=0,
            system=system + "\n\nReturn ONLY a single JSON object. No prose.",
            messages=[{"role": "user", "content": user}],
        )
        return "".join(b.text for b in r.content if getattr(b, "type", "") == "text") or "{}"

    async def complete_text(self, system: str, user: str) -> str:
        r = await self._client.messages.create(
            model=self._model,
            max_tokens=1024,
            temperature=0.7,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(b.text for b in r.content if getattr(b, "type", "") == "text") or ""


class GroqClient:
    """Groq Cloud - blazing-fast inference on open-source models."""

    def __init__(self) -> None:
        from groq import AsyncGroq

        self._client = AsyncGroq(api_key=os.environ["GROQ_API_KEY"])
        self._model = os.environ.get("GROQ_MODEL", "qwen/qwen3.6-27b")
        log.info("GroqClient initialised with model=%s", self._model)

    async def complete_json(self, system: str, user: str) -> str:
        try:
            # Build request kwargs
            kwargs: dict = dict(
                model=self._model,
                temperature=0,
                max_tokens=900,
                messages=[
                    {"role": "system", "content": system + "\n\nReturn ONLY a single JSON object. No markdown, no prose, no thinking tags."},
                    {"role": "user", "content": user},
                ],
            )

            # Qwen 3.x models support chat.extra_body to disable thinking
            # for cleaner JSON output. Try json_object format first.
            try:
                kwargs["response_format"] = {"type": "json_object"}
                r = await self._client.chat.completions.create(**kwargs)
            except Exception:
                # Some models don't support response_format; retry without it
                log.info("response_format not supported for %s, retrying without", self._model)
                del kwargs["response_format"]
                r = await self._client.chat.completions.create(**kwargs)

            content = r.choices[0].message.content or "{}"

            # Qwen 3.x may wrap output in <think>...</think> tags; strip them
            import re
            content = re.sub(r"<think>[\s\S]*?</think>", "", content).strip()

            return content
        except Exception as e:
            log.error("GroqClient.complete_json failed: %s", e)
            raise

    async def complete_text(self, system: str, user: str) -> str:
        try:
            r = await self._client.chat.completions.create(
                model=self._model,
                temperature=0.7,
                max_tokens=900,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            content = r.choices[0].message.content or ""
            
            import re
            content = re.sub(r"<think>[\s\S]*?</think>", "", content).strip()
            
            return content
        except Exception as e:
            log.error("GroqClient.complete_text failed: %s", e)
            raise


class LlmaasTokenManager:
    """Caches the VW IDP OAuth token, refreshing shortly before it expires."""

    def __init__(self) -> None:
        self._token: str | None = None
        self._expires_at: float = 0.0
        self._lock = asyncio.Lock()

    async def get_token(self) -> str:
        async with self._lock:
            if self._token and time.monotonic() < self._expires_at:
                return self._token
            import httpx

            token_url = os.environ.get(
                "LLMAAS_TOKEN_URL",
                "https://idp.cloud.vwgroup.com/auth/realms/kums-mfa/protocol/openid-connect/token",
            )
            async with httpx.AsyncClient() as http:
                r = await http.post(
                    token_url,
                    data={
                        "client_id": os.environ["LLMAAS_CLIENT_ID"],
                        "client_secret": os.environ["LLMAAS_CLIENT_SECRET"],
                        "grant_type": "client_credentials",
                    },
                )
            r.raise_for_status()
            data = r.json()
            self._token = data["access_token"]
            # Refresh 30s before actual expiry to avoid using a stale token mid-request.
            self._expires_at = time.monotonic() + max(int(data.get("expires_in", 300)) - 30, 30)
            return self._token


class LlmaasClient:
    """VW Group internal LLMaaS gateway - OpenAI-compatible API, OAuth client-credentials auth."""

    def __init__(self) -> None:
        from openai import AsyncOpenAI

        self._model = os.environ.get("LLMAAS_MODEL", "gpt-4.1-mini")
        self._tokens = LlmaasTokenManager()
        client_id = os.environ["LLMAAS_CLIENT_ID"]
        self._client = AsyncOpenAI(
            api_key="placeholder",  # replaced per-call via with_options() once a real token is fetched
            base_url=os.environ.get("LLMAAS_BASE_URL", "https://llmapi.ai.vwgroup.com"),
            default_headers={"X-LLM-API-CLIENT-ID": f"Bearer {client_id}"},
        )

    async def _authed_client(self):
        token = await self._tokens.get_token()
        return self._client.with_options(api_key=token)

    def _record_usage(self, r) -> None:
        usage = getattr(r, "usage", None)
        if usage:
            _cost_tracker.record(self._model, usage.prompt_tokens, usage.completion_tokens)

    async def complete_json(self, system: str, user: str) -> str:
        client = await self._authed_client()
        kwargs: dict = dict(
            model=self._model,
            temperature=0,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        try:
            r = await client.chat.completions.create(response_format={"type": "json_object"}, **kwargs)
        except Exception:
            # Not every model behind the gateway supports response_format.
            r = await client.chat.completions.create(**kwargs)
        self._record_usage(r)
        return r.choices[0].message.content or "{}"

    async def complete_text(self, system: str, user: str) -> str:
        client = await self._authed_client()
        r = await client.chat.completions.create(
            model=self._model,
            temperature=0.7,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        self._record_usage(r)
        return r.choices[0].message.content or ""


def build_client() -> LlmClient:
    provider = os.environ.get("LLM_PROVIDER", "mock").lower()
    if provider == "openai":
        return OpenAIClient()
    if provider == "anthropic":
        return AnthropicClient()
    if provider == "groq":
        return GroqClient()
    if provider == "llmaas":
        return LlmaasClient()
    log.warning("Using MockClient (LLM_PROVIDER=%s).", provider)
    return MockClient()

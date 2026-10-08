# Chroma Sync AI service

FastAPI + Pydantic. Three endpoints backing the whole AI layer.

| Endpoint | Purpose |
|---|---|
| `POST /readiness` | Rate a single decision green/yellow/red with a reason and flags. |
| `POST /conflicts` | Detect cross-decision mismatches within a business area. |
| `POST /summarise` | Produce uniform per-record summaries for Meldeliste + Colour-Mix-Chart. |
| `GET  /health`    | Liveness. |

## Run locally

```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env  # then edit
# Note: --reload causes infinite restarts here due to OneDrive sync touching .venv files.
# Run without it and restart manually after code changes:
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

Set `LLM_PROVIDER=mock` if you want to demo without any API key. Every endpoint
still returns a schema-valid response; the mock produces safe deterministic
output.

### VW LLMaaS provider

Set `LLM_PROVIDER=llmaas` to route through VW Group's internal gateway. Required env vars:

| Var | Default | Notes |
|---|---|---|
| `LLMAAS_CLIENT_ID` | - | OAuth client id, keep in `.env` only, never commit |
| `LLMAAS_CLIENT_SECRET` | - | OAuth client secret, keep in `.env` only, never commit |
| `LLMAAS_MODEL` | `gpt-4.1-mini` | Best cost/quality balance for the $15 budget |
| `LLMAAS_BUDGET_USD` | `15` | Log-only warning threshold, no hard stop |
| `LLMAAS_TOKEN_URL` | VW IDP token endpoint | Override only if it changes |
| `LLMAAS_BASE_URL` | `https://llmapi.ai.vwgroup.com` | Override only if it changes |

The token is fetched via OAuth client-credentials and cached in memory until
shortly before it expires. Spend is estimated from response token usage and
logged as a warning at 80% and 100% of `LLMAAS_BUDGET_USD`.

## Security / required configuration

Every endpoint except `GET /health` requires a bearer token. The service
verifies Supabase-signed HS256 tokens with `SUPABASE_JWT_SECRET`, which covers
both browser user tokens (`role=authenticated`) and the service-role key used
by the Edge Functions (`role=service_role`) - no extra shared secret is needed.

| Var | Default | Notes |
|---|---|---|
| `APP_ENV` | `development` | `production` enables fail-fast checks (see below) |
| `SUPABASE_JWT_SECRET` | - | **Required in production.** Dashboard -> Settings -> API -> JWT Secret. If unset the service runs UNAUTHENTICATED. |
| `AI_ALLOWED_ORIGINS` | localhost:5173 | **Required in production.** Comma-separated exact origins. Never `*`. |
| `AI_RATE_LIMIT_REQUESTS` | `60` | Per-user sliding window; `service_role` callers are exempt |
| `AI_RATE_LIMIT_WINDOW_SECONDS` | `60` | |
| `AI_MAX_BODY_BYTES` | `1048576` | Requests above this get a 413 |
| `LOG_LEVEL` | `INFO` | |

With `APP_ENV=production` the service refuses to start if
`SUPABASE_JWT_SECRET` or `AI_ALLOWED_ORIGINS` is missing, or if
`LLM_PROVIDER=mock`. `GET /health` reports `degraded: true` while the mock
provider is active.

The in-process rate limiter is per-worker: with N uvicorn workers the
effective limit is N x `AI_RATE_LIMIT_REQUESTS`. Use a shared store (Redis) or
a gateway-level limit if you scale out.

## Test

```powershell
pip install -r requirements.txt
pytest
```

`tests/conftest.py` disables `load_dotenv` so the suite can never pick up a
developer `.env` and make live LLM calls.

## Design guarantees

- Every LLM call is validated against a strict Pydantic schema.
- On invalid JSON: retry once, then fall back to a rule-based safe response.
- Fallbacks are labelled (`flag: ai_fallback`) so audit history stays honest.
- No loose JSON ever reaches the database.

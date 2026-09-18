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

## Test

```powershell
pip install pytest
pytest
```

## Design guarantees

- Every LLM call is validated against a strict Pydantic schema.
- On invalid JSON: retry once, then fall back to a rule-based safe response.
- Fallbacks are labelled (`flag: ai_fallback`) so audit history stays honest.
- No loose JSON ever reaches the database.

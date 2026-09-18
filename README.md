# Chroma Sync

Shared workspace for cross-team colour and material decisions. One record per component, all four teams read/write to the same record, AI-assisted readiness + conflict detection, live reports.

See [SOLUTION_DESIGN.md](SOLUTION_DESIGN.md) for the full design and [EXECUTION_PLAN.md](EXECUTION_PLAN.md) for the build tracker.

## Stack

- **Frontend:** React + Vite + TypeScript (Phase 2)
- **Backend / DB / Auth / Real-time / RLS:** Supabase (Postgres)
- **AI service:** FastAPI + Pydantic (Phase 3+)
- **LLM:** OpenAI or Anthropic (config swap)

## Repository layout

```
supabase/       Database migrations, RLS, triggers, seed data, edge functions
frontend/       React app (Phase 2)
ai-service/     FastAPI AI service (Phase 3+)
```

## Local development - Phase 1 (database only)

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) `>= 1.170`
- [Podman Desktop](https://podman-desktop.io/) running (free, Apache-2.0 licensed Docker replacement - see note below)

> **Why Podman, not Docker Desktop?** Docker Desktop requires a paid subscription for organisations over 250 employees / $10M revenue. Podman Desktop is a drop-in, Docker-API-compatible replacement that's free for any organisation size.
>
> One-time setup so the Supabase CLI talks to Podman instead of Docker:
> ```powershell
> podman machine init
> podman machine start
> # Point Docker-API-based tools (incl. the Supabase CLI) at Podman's socket:
> $env:DOCKER_HOST = "npipe:////./pipe/podman-machine-default"
> ```
> Add the `$env:DOCKER_HOST` line to your PowerShell profile so it's set in every new terminal.

### Start a local Supabase stack

```powershell
cd supabase
supabase start
```

The CLI runs local Postgres, Auth, Storage, and Studio. Migrations under `supabase/migrations/` are applied automatically on `supabase start` and `supabase db reset`.

### Reset and reseed

```powershell
supabase db reset
```

This drops the local DB, re-runs every migration in order, and executes `supabase/seed.sql`.

### Seed users

The seed script creates four test users (password `chroma-demo`):

| Email | Team |
|---|---|
| `design@chroma.test` | design |
| `engineering@chroma.test` | engineering |
| `procurement@chroma.test` | procurement |
| `quality@chroma.test` | quality |
| `lead@chroma.test` | project_lead |

Sign in as any of them to verify RLS behaves as expected.

### Verify the audit log

```sql
select table_name, action, changed_by, changed_at
from public.audit_log
order by changed_at desc
limit 20;
```

Every insert/update on `decisions` and `approvals` should appear here automatically.

## Design principles

- One record, one truth.
- Access control at the database, not the UI.
- AI advises, humans decide.
- Strict schemas on every LLM boundary.
- Simple beats clever.

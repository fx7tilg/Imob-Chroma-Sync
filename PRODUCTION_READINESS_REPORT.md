# Chroma Sync — Production Readiness Audit & Remediation

Audit performed against the repository working tree. Every claim below is
labelled **VERIFIED** (I executed it or read the code), **PARTIALLY VERIFIED**
(code read, not executed), or **UNVERIFIED** (could not be exercised in this
environment).

---

## 1. Executive summary

Chroma Sync is a feature-rich application, but it was **not** in the state its
documentation describes. The documentation claims a four-layer security model
(RLS + column guards + audit triggers + AI write-gate). That model existed, but
it was **bypassable in one HTTP request** by any authenticated user:
`profiles_update_self` allowed a user to set their own `is_project_lead = true`,
and `is_project_lead()` is the predicate that every other layer defers to.

Separately, the AI service had **no authentication of any kind** on all seven
POST endpoints, with `allow_origins=["*"]`.

I fixed these and 14 other findings, and I fixed the frontend build, which did
not compile. The system is materially more secure than it was. It is still
**not production ready**, primarily because the database migration I wrote
**could not be executed** (no Docker/Postgres in this environment), and because
the project has no CI, no monitoring, no backup/DR evidence, and no deployment
runbook.

**Final verdict: 🔴 NOT PRODUCTION READY** — see §10.

---

## 2. Production readiness scorecard

🟢 PASS · 🟡 PARTIAL · 🔴 FAIL · ⚪ UNVERIFIED

| # | Area | Before | After | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Authentication (end users) | 🔴 | 🟢 | Backdoors removed; demo login gated — VERIFIED |
| 2 | Authorization / RBAC | 🔴 | ⚪ | Guard written, **never executed** — UNVERIFIED |
| 3 | Row Level Security | 🔴 | ⚪ | Policies rewritten, not applied — UNVERIFIED |
| 4 | Privilege escalation | 🔴 | ⚪ | Trigger written, not tested adversarially — UNVERIFIED |
| 5 | Secrets management | 🔴 | 🟡 | Hardcoded creds removed; no vault/rotation — PARTIALLY VERIFIED |
| 6 | AI service authentication | 🔴 | 🟢 | 12 tests passing — VERIFIED |
| 7 | CORS | 🔴 | 🟢 | Allow-list; test asserts not `*` — VERIFIED |
| 8 | Rate limiting | 🔴 | 🟡 | Works, but per-process only — VERIFIED w/ caveat |
| 9 | Input validation | 🔴 | 🟡 | Edge functions + Pydantic; prompts unsanitised — PARTIALLY VERIFIED |
| 10 | Error handling / info leakage | 🔴 | 🟢 | Opaque responses, detail to logs — VERIFIED |
| 11 | Audit trail integrity | 🔴 | ⚪ | Policy rewritten, not applied — UNVERIFIED |
| 12 | SQL injection | 🟢 | 🟢 | Parameterised throughout — VERIFIED |
| 13 | Prompt injection | 🔴 | 🔴 | Unmitigated — VERIFIED as still broken |
| 14 | Build / compilation | 🔴 | 🟢 | `npm run build` exit 0 — VERIFIED |
| 15 | Automated tests (backend) | 🔴 | 🟡 | 17 pass, hermetic; coverage still thin — VERIFIED |
| 16 | Automated tests (frontend) | 🔴 | 🔴 | None exist — VERIFIED |
| 17 | Linting / static analysis | 🔴 | 🔴 | No ESLint config — VERIFIED |
| 18 | CI/CD | 🔴 | 🔴 | No pipeline — VERIFIED |
| 19 | Dependency scanning | 🔴 | 🔴 | None — VERIFIED |
| 20 | Error boundaries / UI resilience | 🔴 | 🟢 | Root boundary added — VERIFIED |
| 21 | Logging | 🟡 | 🟡 | Structured-ish, no aggregation — PARTIALLY VERIFIED |
| 22 | Monitoring / alerting | 🔴 | 🔴 | None — VERIFIED |
| 23 | Backups / DR | ⚪ | ⚪ | No evidence found — UNVERIFIED |
| 24 | Migration safety / reversibility | 🔴 | 🔴 | Destructive drop, no down-migration — VERIFIED |
| 25 | Cost controls (LLM spend) | 🔴 | 🔴 | Log-only, no hard stop — VERIFIED |
| 26 | Deployment runbook | 🔴 | 🟡 | README requirements added; no runbook — VERIFIED |
| 27 | Performance / bundle size | 🔴 | 🔴 | 3 MB JS, no splitting — VERIFIED |
| 28 | Documentation accuracy | 🔴 | 🟡 | Corrected key claims; quota docs still wrong — PARTIALLY VERIFIED |

---

## 3. What was audited

| Layer | Scope | Depth |
| --- | --- | --- |
| Database | 44 migrations, RLS policies, SECURITY DEFINER functions, triggers, `seed.sql` | Read in full; **not executed** |
| Edge Functions | all 5 Deno functions | Read and rewritten; **not deployed** |
| AI service | FastAPI app, 8 endpoints, LLM providers, services layer | Read, modified, **tests executed** |
| Frontend | auth context, AI client, reports, scratch scripts, build config | Read, modified, **build executed** |
| Config | `supabase/config.toml`, `package.json`, `requirements.txt` | Read and modified |
| Ops | CI/CD, monitoring, backups, runbooks | **Searched for; none found** |

**Not audited / out of reach:** runtime behaviour of the database, deployed
Edge Function behaviour, load/performance, penetration testing, actual cloud
project settings, dependency CVE scanning.

---

## 4. Critical findings

### 4.1 Privilege escalation to full admin (P0) — VERIFIED by code read

`supabase/migrations/20260902000002_rls.sql`:

```sql
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
```

RLS cannot express per-column rules, and no column guard existed on `profiles`.
Any authenticated user could run
`supabase.from("profiles").update({ is_project_lead: true })` and become a
project lead — which grants master-data writes, status overrides, admin
transparency views, and bypasses the `decisions` column guard.

**This single issue invalidated the entire documented security model.**

### 4.2 Self-service admin at signup (P0) — VERIFIED

`handle_new_user()` read `is_project_lead` straight from
`raw_user_meta_data`, which is **attacker-controlled** (`AuthContext.signUp`
passed it from the browser). Signing up with `is_project_lead: true` granted
admin on account creation.

### 4.3 AI service completely unauthenticated (P0) — VERIFIED

All seven POST endpoints were open, with `allow_origins=["*"]`, no rate limit,
and no body-size limit. Anyone who could reach the host could run arbitrary
prompts against the LLM budget and read any decision data submitted to it.

### 4.4 `pki-auth` Edge Function (P0) — VERIFIED

Unauthenticated, service-role-backed, and brute-forceable: a 4-digit PIN space
with **no rate limiting**, returning `role` and `is_project_lead`. The seeded
PINs are sequential (`1001`–`1012`, `9999` admin). It is dead code — no
frontend component calls it.

### 4.5 Card PINs readable by everyone (P0) — VERIFIED

`profiles_select_all` is `using (true)` and `profiles.pki_pin` sat in that
table, so every authenticated user could read every other user's card PIN.

### 4.6 Forgeable audit log (P1) — VERIFIED

```sql
create policy audit_log_insert_all on audit_log for insert with check (true);
```

Any user could insert audit entries attributed to anyone, including
`is_admin_override = true`. The audit trail was not trustworthy evidence.

### 4.7 `set_ai_readiness` is a decision-integrity hole (P1) — VERIFIED

Granted to `authenticated`, and the 11-argument overload **auto-rejects** a
decision when `p_rating = 'red'`. Any user could forge an AI verdict or
force-reject any decision with one RPC call.

### 4.8 Frontend did not compile (P1) — VERIFIED by execution

`npm run build` runs `tsc -b`, which failed with **48 `TS6133` errors**. The
production build was broken on the main branch.

### 4.9 Tests were not hermetic and were silently making live LLM calls (P1) — VERIFIED

`load_dotenv(override=True)` at import time overrode the test environment with
the developer's `.env` (`LLM_PROVIDER=llmaas`). The "mock LLM" contract tests
were calling `https://idp.cloud.vwgroup.com/.../token` and getting 401s. Four
tests were failing.

### 4.10 Degraded AI results were indistinguishable from real ones (P1) — VERIFIED

In `readiness_service._deep_analysis()`, the exception path returned
`deterministic_aggregate, None, []` — an empty flag list. When the LLM failed,
the UI displayed the rating as if it were a full AI assessment. The documented
`ai_fallback` guarantee was not implemented.

---

## 5. Fixes implemented

### 5.1 Database — `supabase/migrations/20260919000000_security_hardening.sql` (new)

| Problem | Root cause | Change |
| --- | --- | --- |
| 3.1 Privilege escalation | RLS cannot do per-column rules | New `profiles_privilege_guard()` BEFORE UPDATE trigger mirroring the existing `decisions` column-guard pattern. `is_project_lead`, `role`, `team`, `id` are writable only by `service_role` or an existing project lead. |
| 3.2 Signup escalation | Trusted user-supplied metadata | `handle_new_user()` now hardcodes `is_project_lead = false`. Also wraps the `team_t` cast so a bad team string cannot abort signup. |
| 3.5 PIN exposure | Credential stored in a `using (true)` table | `pki_pin` **dropped** from `profiles`; demo PINs moved to `demo_pki_pins`, RLS enabled with **no policies** (reachable only by `service_role`). |
| 3.6 Forgeable audit | `with check (true)` | Replaced with `audit_log_insert_self`: `changed_by = auth.uid()` and `is_admin_override = false`. The SECURITY DEFINER audit trigger is unaffected. |
| 3.7 Decision integrity | No state check | Both `set_ai_readiness` overloads now reject writes from non-service callers when the decision is `approved`/`rejected`. |
| Search-path hijack | SECURITY DEFINER without pinned path | `increment_ai_quota` and `snapshot_on_status_change` recreated with `set search_path = public`. Logic preserved byte-for-byte (verified against `20260912000005`). |

The migration is idempotent and re-runnable.

**Self-correction during re-audit:** my first draft used
`revoke select (pki_pin) on profiles from authenticated`. That is a **no-op** —
Postgres cannot carve a column out of an existing table-level `GRANT`, and
Supabase grants table-level `SELECT` to `authenticated`. My first draft also
*added* the `pki_pin` column to production, where it had never existed. Both
were wrong and were replaced with the column drop described above.

### 5.2 AI service

**New `ai-service/app/security.py`** — JWT verification, rate limiting, origin
control. Design decision: authenticate by verifying **Supabase-signed HS256
tokens** with `SUPABASE_JWT_SECRET`. This works for browser user tokens
(`role=authenticated`) *and* the service-role key the Edge Functions already
send, so no new secret ships in the frontend bundle.

- `require_caller()` dependency on all 7 POST endpoints: 401 unauthenticated,
  403 for roles outside `{authenticated, service_role}`, 429 with `Retry-After`.
- `service_role` callers are exempt from rate limiting (Edge Functions do bulk work).
- CORS locked to an explicit allow-list; **never** `*`.
- Body-size middleware → 413.
- Catch-all exception handler → opaque `{"detail": "internal error"}`, full
  detail to logs only.
- Fail-fast: refuses to start when `APP_ENV=production` and
  `SUPABASE_JWT_SECRET` / `AI_ALLOWED_ORIGINS` are missing or
  `LLM_PROVIDER=mock`.
- `/health` now exposes `degraded`.

**`readiness_service.py`** — the fallback path now returns a real
`ReadinessFlag(flag="ai_fallback", ...)`, and `asyncio.TimeoutError` is handled
and logged separately from generic failures.

**Tests** — `tests/conftest.py` neutralises `load_dotenv` before `app.main` is
imported, making the suite hermetic. Added `tests/test_security.py` (12 tests)
covering: missing token, forged signature, expired token, wrong role, valid
user, `/health` exemption, per-user rate limiting, service-role exemption,
oversized body, CORS not-`*`, and production fail-fast.

### 5.3 Edge Functions

**New `supabase/functions/_shared/security.ts`** — origin allow-list CORS,
`requireUser()`, `isServiceCaller()` using a **constant-time** comparison,
`fetchWithTimeout()`, and `aiAuthHeaders()`.

| Function | Change |
| --- | --- |
| `dima-lookup`, `vred-preview` | Now require an authenticated caller; input validated against a strict pattern; stopped returning `error.message` / `String(e)` to the client. |
| `on-decision-submitted` | Service-caller gate; UUID validation; 30s timeout; AI failure now writes an explicit `ai_unavailable` flag instead of leaving the decision unrated. |
| `detect-conflicts` | Service-caller gate; 60s timeout; replaced a silent `catch {}` with real error logging. |
| `pki-auth` | **Disabled unless `ENABLE_PKI_DEMO_AUTH=true`** (404 otherwise); per-IP rate limit; no longer returns `role`/`is_project_lead`; identical response for bad PIN and no match (no oracle); now reads the locked-down `demo_pki_pins` table. |

### 5.4 Frontend

- **New `src/lib/aiClient.ts`** — single `aiPost()` helper that attaches the
  Supabase access token and applies a 30s `AbortController` timeout. Without
  this, hardening the AI service would have broken every AI feature with 401s.
  `ai.ts` and `reports.ts` now route all four call sites through it.
- **Removed `devBypassLogin()`** — it minted a fake session
  (`access_token: "mock-token"`) with an arbitrary caller-chosen role, plus the
  `"mock-token"` special cases in the profile effect and `signOut`. It was
  unreferenced.
- **`signInWithPKI`** gated behind `import.meta.env.DEV ||
  VITE_ENABLE_DEMO_LOGIN`, and the hardcoded password `"chroma-demo"` moved to
  `VITE_DEMO_PASSWORD`. Error message no longer leaks the auth failure reason.
- **`signUp`** no longer sends `is_project_lead`.
- **New `ErrorBoundary`** wrapping the app (previously any render error gave a
  blank page — there was no boundary anywhere in the codebase).
- **Removed ~15 `console.log` calls** that dumped full decision/conflict rows
  to the browser console; replaced with `aiDebug()`, which compiles out of
  production builds.
- **Removed hardcoded credentials**: a live Supabase URL + publishable key in
  `scratch_query.js`, and `designer1@chroma.com / password123` plus a
  machine-specific absolute path in `test-rpc.js`.
- **Fixed the broken build** — 48 unused-declaration errors removed without
  disabling `noUnusedLocals`.

### 5.5 Configuration & docs

- `config.toml`: added explicit `verify_jwt` for all five functions. I
  **reverted** my own change to `site_url`/`enable_confirmations` after
  confirming this file configures the *local* stack only — changing it would
  have broken local dev while giving a false sense of production safety. The
  production requirement is now documented instead.
- `README.md`: new "Production deployment requirements" section covering
  required env vars, the warning never to run `seed.sql` against production,
  and the `fix_rls.sql` drift.
- `ai-service/README.md`: security/configuration section.

---

## 6. Verification results

| Check | Command | Result |
| --- | --- | --- |
| AI service tests | `pytest -q` | **17 passed** — VERIFIED |
| Frontend typecheck | `npx tsc -b --noEmit --force` | **exit 0** — VERIFIED |
| Frontend production build | `npm run build` | **exit 0**, built in 1m 1s — VERIFIED |
| No `pki_pin` references remain in code | grep | **0 matches** — VERIFIED |
| Audit-log inserts compatible with new policy | read `reports.ts`, `Rbac.tsx` | both set `changed_by = session.user.id`, neither sets `is_admin_override` — PARTIALLY VERIFIED |
| Admin role changes still work under the new guard | read `Rbac.tsx:370` | caller is a project lead, which the guard permits — PARTIALLY VERIFIED |
| **Migration correctness** | — | **UNVERIFIED — never executed** |
| **Edge Function behaviour** | — | **UNVERIFIED — never deployed; `// @ts-nocheck` means not even typechecked** |

**Why the gap:** `docker` is not available on this machine, so no local
Postgres could be started and `supabase db reset` could not be run.

---

## 7. Remaining issues

### Blockers (must fix before production)

1. **The security migration has never been executed.** It must be applied to a
   scratch database and each control tested (try the escalation as a normal
   user; confirm admin role changes still work; confirm signup works).
2. **Edge Functions have never been deployed or typechecked.** All five carry
   `// @ts-nocheck`. Remove it and run `deno check`.
3. **No CI/CD.** No pipeline, no lint (no ESLint config at all), no frontend
   tests, no dependency vulnerability scanning.
4. **No monitoring, alerting, or error tracking.** `componentDidCatch` logs to
   `console` because there is no sink to send it to.
5. **No backup/restore or disaster-recovery evidence**, and no tested rollback.
6. **No deployment runbook.**
7. **`fix_rls.sql` drift** — a policy change applied outside the migration
   chain, so the deployed schema cannot be reproduced from the repository.

### Non-blockers (should fix)

8. **Prompt injection is unmitigated.** Decision notes and chat messages are
   `json.dumps`'d directly into prompts with no delimiting or instruction
   defence (`readiness_service.py` L69-76, `chat_service.py` L37-45).
9. **LLM budget is not enforced.** `_CostTracker` only logs; `LLMAAS_BUDGET_USD`
   has no hard stop. Spend is unbounded.
10. **AI quota is client-side only.** `aiQuota.ts` is pure `localStorage` and is
    trivially bypassed. Note also a **documentation/reality mismatch**: the docs
    claim 2/4 per day, the code uses `DEFAULT_QUOTA = 100`.
11. **Rate limiting is per-process.** With N uvicorn workers the real limit is
    N x the configured value. Needs Redis or a gateway limit.
12. **Early migrations are not re-runnable**, and `20260906000010` performs a
    `delete from master_business_areas`.
13. **3 MB JS bundle** (859 kB gzipped), no code splitting.
14. **Dependencies use `^` ranges** with no lockfile policy stated.
15. `set_ai_readiness` remains callable by `authenticated`. I closed the
    terminal-state hole, but the browser-writes-its-own-AI-verdict architecture
    is still weak; the correct design is to let only the Edge Function write it.

### Unverified

16. Whether the new `profiles` trigger interacts correctly with
    `profiles_update_admin`.
17. Whether `demo_pki_pins` migration ordering is correct relative to
    `seed.sql` execution.
18. Actual production Supabase dashboard settings (email confirmation, site URL).
19. Any performance characteristic whatsoever.

---

## 8. Production deployment requirements

Documented in `README.md` → "Production deployment requirements". Summary of
the ones that are **dangerous if missed**:

- `SUPABASE_JWT_SECRET` on the AI service — without it, the service starts
  **unauthenticated**. It logs `CRITICAL`, but it starts.
- `AI_ALLOWED_ORIGINS` and `ALLOWED_ORIGINS` — exact origins.
- `ENABLE_PKI_DEMO_AUTH` and `VITE_ENABLE_DEMO_LOGIN` — must stay unset.
- Supabase dashboard: enable email confirmation, set the real site URL.
- Never run `seed.sql` against production.

---

## 9. Rollback plan

| Change | Rollback | Risk |
| --- | --- | --- |
| AI service | Redeploy previous image, or unset `SUPABASE_JWT_SECRET` to restore open access | Low — reverts to insecure but working |
| Frontend | Redeploy previous bundle | Low |
| Edge Functions | `supabase functions deploy <name>` from the previous commit | Low |
| **Security migration** | **No down-migration exists.** `profiles.pki_pin` is **dropped** — data is destroyed unless `demo_pki_pins` is preserved. | **HIGH** |

**Required before applying the migration:** take a full database backup and
verify the restore. The `pki_pin` drop is irreversible without it. I recommend
splitting the column drop into a separate, later migration so the privilege
fixes can be deployed independently of a destructive change.

---

## 10. Final verdict

# 🔴 NOT PRODUCTION READY

The security posture improved substantially: five P0 vulnerabilities — any of
which was individually sufficient for a full compromise — are now addressed in
code, and the application builds and tests cleanly for the first time.

But "addressed in code" is not "verified in production". The verdict is driven
by evidence, not by effort:

- The migration that carries **most** of the security value has **never been
  run**. I cannot assert it even executes without error, let alone that it
  blocks the attack.
- The Edge Functions have never been deployed or typechecked.
- The destructive `pki_pin` drop has no tested rollback.
- There is no CI, no monitoring, no alerting, no backup evidence, and no
  runbook. These are not optional for a production system; their absence alone
  is disqualifying regardless of application-level security.

### Minimum path to 🟡 CONDITIONALLY PRODUCTION READY

1. Apply the migration to a scratch DB and **test each control adversarially**.
2. Remove `// @ts-nocheck`, `deno check`, and deploy the functions to staging.
3. Verify an authenticated end-to-end run against the hardened AI service.
4. Stand up error tracking and uptime alerting.
5. Prove a backup restore works.
6. Split out or justify the destructive column drop.

Items 1–3 are mechanical and mostly blocked only by the lack of Docker here.
Items 4–6 require infrastructure decisions I cannot make unilaterally.

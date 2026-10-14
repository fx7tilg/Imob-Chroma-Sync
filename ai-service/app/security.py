"""Request-level security for the Chroma Sync AI service.

The service is reachable from two places:

* the browser, which holds a Supabase user access token, and
* the Deno Edge Functions, which hold the Supabase service-role key.

Supabase signs user access tokens with a per-project asymmetric key (ES256 or
RS256) published at ``/auth/v1/.well-known/jwks.json``, while the legacy
anon/service-role keys remain HS256 tokens signed with ``SUPABASE_JWT_SECRET``.
Both are accepted here, selected by the ``alg`` header, so one dependency
covers both callers and no new shared secret ships in the frontend bundle.
"""

from __future__ import annotations

import logging
import os
import time
from collections import deque
from threading import Lock

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

log = logging.getLogger("chroma-ai.security")

APP_ENV = os.environ.get("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV in {"production", "prod"}

_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "").strip()
_SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
_ACCEPTED_ROLES = {"authenticated", "service_role"}
_ASYMMETRIC_ALGS = ("ES256", "RS256")

# Rate limit: requests per window, per caller (user id, else client IP).
_RATE_LIMIT = int(os.environ.get("AI_RATE_LIMIT_REQUESTS", "60"))
_RATE_WINDOW_S = int(os.environ.get("AI_RATE_LIMIT_WINDOW_SECONDS", "60"))

# Largest request body we are willing to buffer and forward to an LLM.
MAX_BODY_BYTES = int(os.environ.get("AI_MAX_BODY_BYTES", str(1024 * 1024)))

if not _JWT_SECRET and not _SUPABASE_URL:
    if IS_PRODUCTION:
        raise RuntimeError(
            "SUPABASE_JWT_SECRET or SUPABASE_URL is required when "
            "APP_ENV=production. Refusing to start an unauthenticated AI service."
        )
    log.critical(
        "Neither SUPABASE_JWT_SECRET nor SUPABASE_URL is set - AI endpoints are "
        "UNAUTHENTICATED. This is only acceptable for local development."
    )

AUTH_ENABLED = bool(_JWT_SECRET or _SUPABASE_URL)

_jwks_client: jwt.PyJWKClient | None = (
    jwt.PyJWKClient(f"{_SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True)
    if _SUPABASE_URL
    else None
)

_bearer = HTTPBearer(auto_error=False)


class Caller:
    """The verified identity behind a request."""

    __slots__ = ("subject", "role")

    def __init__(self, subject: str, role: str) -> None:
        self.subject = subject
        self.role = role

    @property
    def is_service(self) -> bool:
        return self.role == "service_role"


class _SlidingWindowLimiter:
    def __init__(self, limit: int, window_s: int) -> None:
        self._limit = limit
        self._window = window_s
        self._hits: dict[str, deque[float]] = {}
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        if self._limit <= 0:
            return True
        now = time.monotonic()
        cutoff = now - self._window
        with self._lock:
            bucket = self._hits.setdefault(key, deque())
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= self._limit:
                return False
            bucket.append(now)
            # Keep the dict from growing without bound on a long-lived process.
            if len(self._hits) > 10_000:
                for stale_key in [k for k, v in self._hits.items() if not v]:
                    del self._hits[stale_key]
            return True


_limiter = _SlidingWindowLimiter(_RATE_LIMIT, _RATE_WINDOW_S)


def allowed_origins() -> list[str]:
    """CORS allow-list. Never defaults to ``*`` in production."""
    raw = os.environ.get("AI_ALLOWED_ORIGINS", "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    if IS_PRODUCTION:
        raise RuntimeError(
            "AI_ALLOWED_ORIGINS must be set when APP_ENV=production "
            "(comma-separated list of frontend origins)."
        )
    return ["http://localhost:5173", "http://127.0.0.1:5173"]


def _signing_key(token: str) -> tuple[object, list[str]]:
    """Pick the verification key from the token's own ``alg`` header.

    The header is untrusted, but it only selects which key to verify against -
    an attacker cannot downgrade to a key we do not hold, and ``algorithms`` is
    pinned so ``alg: none`` is never accepted.
    """
    alg = str(jwt.get_unverified_header(token).get("alg", ""))

    if alg in _ASYMMETRIC_ALGS:
        if _jwks_client is None:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "asymmetric token received but SUPABASE_URL is not configured",
            )
        return _jwks_client.get_signing_key_from_jwt(token).key, [alg]

    if alg == "HS256":
        if not _JWT_SECRET:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "HS256 token received but SUPABASE_JWT_SECRET is not configured",
            )
        return _JWT_SECRET, ["HS256"]

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "unsupported token algorithm")


def _decode(token: str) -> dict:
    try:
        key, algorithms = _signing_key(token)
        return jwt.decode(
            token,
            key,
            algorithms=algorithms,
            # Supabase's legacy anon/service-role keys carry no `aud` claim,
            # while user tokens use aud="authenticated". Role is checked below.
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token expired")
    except jwt.PyJWKClientError as exc:
        log.warning("JWKS lookup failed: %s", exc)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")


async def require_caller(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> Caller:
    """FastAPI dependency: verify the bearer token and apply a rate limit."""
    if not AUTH_ENABLED:
        caller = Caller(subject=_client_key(request), role="authenticated")
    else:
        if creds is None or not creds.credentials:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "missing bearer token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        claims = _decode(creds.credentials)
        role = str(claims.get("role", ""))
        if role not in _ACCEPTED_ROLES:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient role")
        caller = Caller(subject=str(claims.get("sub") or _client_key(request)), role=role)

    # Edge Functions run server-side on our behalf and are already bounded by
    # pg_cron / submit volume; rate limiting them would drop real work.
    if not caller.is_service and not _limiter.allow(caller.subject):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "rate limit exceeded",
            headers={"Retry-After": str(_RATE_WINDOW_S)},
        )
    return caller


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"

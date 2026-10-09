"""Security tests: these run a second app instance with auth switched on.

`app.security` reads its configuration at import time, so the module is
re-imported under a patched environment rather than mutated in place.
"""

import importlib
import os
import sys
import time

import jwt
import pytest
from fastapi.testclient import TestClient

SECRET = "test-jwt-secret-for-unit-tests"


def _token(role: str, sub: str = "user-1", expired: bool = False) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": sub,
            "role": role,
            "iat": now - 10,
            "exp": now - 5 if expired else now + 3600,
        },
        SECRET,
        algorithm="HS256",
    )


@pytest.fixture()
def secure_client(monkeypatch):
    # app.main calls load_dotenv(override=True) at import time; a developer's
    # local .env must not be able to override the test configuration.
    import dotenv

    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: False)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setenv("AI_ALLOWED_ORIGINS", "https://chroma.example")
    monkeypatch.setenv("AI_RATE_LIMIT_REQUESTS", "3")
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("APP_ENV", "development")
    for mod in ("app.main", "app.credits", "app.security"):
        sys.modules.pop(mod, None)
    main = importlib.import_module("app.main")
    yield TestClient(main.app)
    for mod in ("app.main", "app.credits", "app.security"):
        sys.modules.pop(mod, None)


def _payload():
    return {
        "decision": {
            "id": "d1",
            "component_name": "Door Panel A",
            "business_area": "Interior - Front",
            "colour_code": "CS-114",
            "material_reference": "MAT-7892",
            "status": "submitted",
            "owner_team": "design",
        },
        "material": None,
        "approvals": [],
    }


def test_rejects_request_without_token(secure_client):
    r = secure_client.post("/readiness", json=_payload())
    assert r.status_code == 401


def test_rejects_forged_token(secure_client):
    forged = jwt.encode({"sub": "x", "role": "service_role"}, "wrong-secret", algorithm="HS256")
    r = secure_client.post(
        "/readiness", json=_payload(), headers={"authorization": f"Bearer {forged}"}
    )
    assert r.status_code == 401


def test_rejects_expired_token(secure_client):
    r = secure_client.post(
        "/readiness",
        json=_payload(),
        headers={"authorization": f"Bearer {_token('authenticated', expired=True)}"},
    )
    assert r.status_code == 401


def test_rejects_anon_role(secure_client):
    r = secure_client.post(
        "/readiness", json=_payload(), headers={"authorization": f"Bearer {_token('anon')}"}
    )
    assert r.status_code == 403


def test_accepts_valid_user_token(secure_client):
    r = secure_client.post(
        "/readiness",
        json=_payload(),
        headers={"authorization": f"Bearer {_token('authenticated')}"},
    )
    assert r.status_code == 200


def test_health_needs_no_token(secure_client):
    assert secure_client.get("/health").status_code == 200


def test_rate_limit_applies_per_user(secure_client):
    headers = {"authorization": f"Bearer {_token('authenticated', sub='rate-test')}"}
    codes = [
        secure_client.post("/readiness", json=_payload(), headers=headers).status_code
        for _ in range(5)
    ]
    assert codes[:3] == [200, 200, 200]
    assert 429 in codes


def test_service_role_is_not_rate_limited(secure_client):
    headers = {"authorization": f"Bearer {_token('service_role', sub='edge-fn')}"}
    codes = [
        secure_client.post("/readiness", json=_payload(), headers=headers).status_code
        for _ in range(5)
    ]
    assert codes == [200] * 5


def test_oversized_body_rejected(secure_client):
    headers = {
        "authorization": f"Bearer {_token('authenticated', sub='big')}",
        "content-type": "application/json",
    }
    big = b'{"decision": "' + b"a" * (2 * 1024 * 1024) + b'"}'
    r = secure_client.post("/readiness", content=big, headers=headers)
    assert r.status_code == 413


def test_cors_allow_list_is_not_wildcard(secure_client):
    r = secure_client.options(
        "/readiness",
        headers={
            "origin": "https://evil.example",
            "access-control-request-method": "POST",
        },
    )
    assert r.headers.get("access-control-allow-origin") != "*"


def test_production_requires_jwt_secret(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
    sys.modules.pop("app.security", None)
    with pytest.raises(RuntimeError):
        importlib.import_module("app.security")
    sys.modules.pop("app.security", None)

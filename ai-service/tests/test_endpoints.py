"""Contract tests for the AI service. Runs against the mock LLM."""

import os

os.environ.setdefault("LLM_PROVIDER", "mock")

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _decision(id_="d1", **overrides):
    base = {
        "id": id_,
        "component_name": "Door Panel A",
        "business_area": "Interior - Front",
        "colour_code": "CS-114",
        "material_reference": "MAT-7892",
        "status": "submitted",
        "owner_team": "design",
    }
    base.update(overrides)
    return base


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_readiness_returns_valid_shape():
    r = client.post(
        "/readiness",
        json={"decision": _decision(), "material": None, "approvals": []},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["rating"] in {"green", "yellow", "red"}
    assert isinstance(body["reason"], str) and body["reason"]
    assert isinstance(body["flags"], list)


def test_readiness_fallback_flags_when_fields_missing(monkeypatch):
    from app.services import readiness_service

    class Broken:
        async def complete_json(self, system, user):
            return "not json at all"

    monkeypatch.setattr(readiness_service, "_client", Broken())
    r = client.post(
        "/readiness",
        json={
            "decision": _decision(colour_code=None, material_reference=None),
            "material": None,
            "approvals": [],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["rating"] == "red"
    assert any(f["flag"] == "ai_fallback" for f in body["flags"])


def test_conflicts_empty_when_single_decision():
    r = client.post(
        "/conflicts",
        json={"business_area": "Interior - Front", "decisions": [_decision()]},
    )
    assert r.status_code == 200
    assert r.json() == {"conflicts": []}


def test_summaries_fallback_when_llm_returns_empty():
    r = client.post("/summarise", json={"decisions": [_decision(), _decision("d2")]})
    assert r.status_code == 200
    body = r.json()
    ids = {s["id"] for s in body["summaries"]}
    assert ids == {"d1", "d2"}

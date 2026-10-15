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
    body = r.json()
    assert body["status"] == "ok"
    assert body["llm_provider"] == "mock"
    assert body["degraded"] is True


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


def test_llm_cannot_escalate_rating_to_red(monkeypatch):
    """A red rating marks a decision as blocked, so it must come from the scorer.

    Regression: the narrator answered "red" for a freshly submitted decision
    because Engineering/Procurement fields were still empty, and that verdict
    overrode a non-red deterministic score.
    """
    import json

    from app.services import readiness_service

    class Alarmist:
        async def complete_json(self, system, user):
            return json.dumps({
                "rating": "red",
                "reason": "Engineering fields missing.",
                "flags": [{"flag": "engineering_fields_missing", "detail": "x"}],
            })

    monkeypatch.setattr(readiness_service, "_client", Alarmist())
    material = {
        "code": "MAT-7892", "display_name": "Test", "lifecycle_status": "active",
        "compliance_status": "pass", "lead_time_weeks": 4,
    }
    r = client.post(
        "/readiness",
        json={"decision": _decision(component_id="CMP-1"), "material": material, "approvals": []},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["rating"] != "red"
    assert all(body[k]["rating"] != "red" for k in (
        "rc1_lifecycle", "rc2_compliance", "rc3_lead_time",
        "rc4_visual", "rc5_approval_rbac", "rc6_conflict",
    ))
    # The narrative and its advisory flags are still surfaced.
    assert any(f["flag"] == "engineering_fields_missing" for f in body["flags"])


def test_conflicts_empty_when_single_decision():
    r = client.post(
        "/conflicts",
        json={
            "business_area": "Interior - Front",
            "decisions": [_decision()],
            # Without the master list the orphan-material detector fires, which
            # is correct behaviour but not what this test is about.
            "materials": [{"code": "MAT-7892", "display_name": "Soft-touch PP"}],
        },
    )
    assert r.status_code == 200
    assert r.json() == {"conflicts": []}


def test_conflicts_flags_material_missing_from_master_list():
    r = client.post(
        "/conflicts",
        json={"business_area": "Interior - Front", "decisions": [_decision()], "materials": []},
    )
    assert r.status_code == 200
    types = {c["conflict_type"] for c in r.json()["conflicts"]}
    assert "orphan_material" in types


def test_summaries_fallback_when_llm_returns_empty():
    r = client.post("/summarise", json={"decisions": [_decision(), _decision("d2")]})
    assert r.status_code == 200
    body = r.json()
    ids = {s["id"] for s in body["summaries"]}
    assert ids == {"d1", "d2"}

"""Priority Briefing service - identifies the most critical decisions needing evaluation."""

from __future__ import annotations

import asyncio
import json
import logging
import re

from ..llm import build_client
from ..schemas import PriorityBriefingRequest, PriorityBriefingResponse, PriorityItem

log = logging.getLogger("chroma-ai.priority_briefing")
_client = build_client()

_LLM_TIMEOUT = 30

# ── Decision-level briefing prompt (structured JSON output) ──
SYSTEM_PROMPT_DECISION_BRIEFING = """You are Chroma AI, the elite decision analysis engine of an enterprise automotive CMF (Color, Material, Finish) governance platform.

You are performing a DEEP, highly professional AI Deep Analysis of a SINGLE design decision. Your job is to provide a comprehensive, enterprise-grade explanation of exactly what has been done, what is happening now, what needs to be improved, and the best solution going forward.

You will receive:
- The decision data (component, status, ratings, fields, versioning)
- Pre-computed signals identifying what needs attention
- Related approvals and conflicts

For each signal, provide a rich, detailed, human-readable explanation. Dive deep into versions, conflicts, and blockers so everyone is aware of what is happening.

RULES:
- Use ONLY the data provided. NEVER invent deadlines, owners, risks, suppliers, material specs, or facts.
- If information is unavailable, say "Information unavailable" — do NOT hallucinate.
- Write in a highly professional, enterprise-grade tone. Give an in-depth explanation.
- Be specific about what field, team, or process is affected.
- No emoji. No marketing language.

Return a JSON object:
{
  "headline": "One-sentence summary of the decision's current state",
  "overview": "A deep, multi-sentence professional overview of the decision's state, versioning history, and overall progress",
  "items": [
    {
      "issue": "What specifically requires attention",
      "impact": "A deep explanation of the impact on downstream processes, teams, or conflicts",
      "why_now": "Why this matters right now and why it is critical",
      "next_action": "The best solution or concrete action to resolve this",
      "owner": "Which team is responsible (Design/Engineering/Procurement/Quality or null)"
    }
  ]
}

Return ONLY a single JSON object. No markdown wrapping the JSON.
"""

# ── Project-level comprehensive audit prompt ──
SYSTEM_PROMPT_COMPREHENSIVE_AUDIT = """You are Chroma AI, the elite project audit intelligence engine of an enterprise automotive SaaS platform.

You are performing a DEEP, highly professional analysis of ALL active design decisions across the vehicle programme. The frontend has computed deterministic findings. Your job is to synthesize these findings into a comprehensive, executive-grade analysis of what has been done, what is being done, and how it can be improved.

RULES:
- Use ONLY the data provided. NEVER invent problems, risks, or metrics.
- Write in a highly professional, enterprise-grade tone. Provide an in-depth explanation that leaves no detail behind.
- For the executive summary, provide a thorough multi-paragraph overview of the project health, major risks, and strategic directions.
- For the finding narratives, provide a deep, rich explanation of why the finding matters, how it impacts the project, and the best solution to resolve it.
- Be specific: name component names, colour codes, team names from the data.
- No emoji. No marketing language.

Return a JSON object:
{
  "executive_summary": "A deep, professional multi-paragraph overview of project health, current status, and required improvements. Format with markdown if helpful.",
  "finding_narratives": {
    "<finding_id>": "A comprehensive, deep analysis of this specific finding, its impact, and recommended best solution."
  },
  "priority_actions": [
    "Concrete, high-impact strategic action 1",
    "Concrete, high-impact strategic action 2"
  ]
}

Return ONLY a single JSON object. No markdown wrapping the JSON.
"""

# ── Enterprise Risk Assessment prompt ──
SYSTEM_PROMPT_RISK_ASSESSMENT = """You are Chroma AI, an elite enterprise PLM (Product Lifecycle Management) decision intelligence engine.

Your task is to analyze the complete accessible decision landscape and generate a definitive Risk Assessment answering:
"What are the 5 most critical risks, why are they critical, what is already being done, what is still unresolved, what is affected, and what needs attention first?"

You will receive deterministic findings and cross-team impact data. The deterministic layer has already identified the issues; your job is to explain the evidence deeply and clearly.

RULES:
- Do NOT hallucinate. Do not invent risks, people, dates, or teams. If data isn't there, state it's not recorded.
- Write in a highly professional, enterprise PLM tone. Be specific.
- Differentiate clearly between "Already being done" and "Still needs attention".
- STRICTLY use numerical digits for counts (e.g., use "5" instead of "five").

Return ONLY a JSON object:
{
  "executive_summary": "A concise executive risk posture overview (Critical/High/Blocked/Overdue). Use markdown.",
  "top_5_risks": [
    {
      "rank": 1,
      "title": "Clear risk title",
      "severity": "critical or attention",
      "what_is_the_risk": "Deep explanation of the core issue",
      "why_is_it_critical": "Why this matters",
      "already_being_done": "What actions have been recorded so far",
      "still_needs_attention": "The exact unresolved issue",
      "impact": "Impact on downstream processes",
      "why_now": "Why this is urgent",
      "next_action": "Concrete required action",
      "affected_teams": ["team1", "team2"],
      "affected_decisions": ["ID1", "ID2"]
    }
  ],
  "what_needs_attention_first": "A clear evidence-based action sequence. Use markdown."
}

Return ONLY a single JSON object. No markdown wrapping the JSON.
"""
# ── Decision Deep Analysis Prompt ──
SYSTEM_PROMPT_DECISION_DEEP_ANALYSIS = """You are Chroma AI, an elite enterprise PLM (Product Lifecycle Management) decision intelligence engine.

Your task is to analyze ONE specific submitted decision and all context surrounding it.
The user needs a deeply structured enterprise-grade view answering: "What exactly is happening with this decision, who is involved, what version/state is current, what has happened previously, what conflicts or risks exist, what is already being done, what is still pending, what happens next, and what should every relevant role look at before this decision moves forward?"

RULES:
- Do NOT hallucinate. Do not invent people, actions, dates, versions, or approvals.
- Use the provided context: Decision details, Approvals, Conflicts, Audit Events (history), and Deterministic Findings.
- If data is missing for a section, state "No recorded activity" or "Not available".
- STRICTLY use numerical digits for counts.
- Separate "Already being done" (actual recorded actions) from "Still needs attention" (unresolved items).
- Provide concrete, evidence-based "What to check" guidance for each role.

Return ONLY a JSON object exactly matching this structure (all strings should be markdown-formatted where appropriate):
{
  "executive_summary": "A powerful short summary (Decision: ..., Status: ..., Version: ..., Risk: ..., Blocked by: ...)",
  "who_is_doing_what": [
    { "role": "Team/Role", "current_state": "e.g., Submitted/Reviewing/Waiting", "what_they_did": "...", "what_they_need": "..." }
  ],
  "version_analysis": {
    "current_version": "vX",
    "status": "...",
    "history_markdown": "Deep explanation of meaningful changes between versions, whether approvals became stale, etc."
  },
  "workflow_analysis": "Markdown showing stage progression (e.g., Design ✓ -> Engineering ● -> Procurement ○) and what's blocked.",
  "approval_analysis": "Markdown deeply inspecting approval state, who approved, who rejected, which version they acted on.",
  "conflict_analysis": "Markdown explaining WHY conflicts exist, WHERE to look, WHO is affected, and WHAT to check.",
  "readiness_analysis": "Markdown explaining the deterministic readiness score, what passed, what failed, what's pending.",
  "risk_analysis": {
    "already_being_done": "Markdown list of actual recorded mitigating actions",
    "still_needs_attention": "Markdown list of actual unresolved items"
  },
  "dependency_analysis": "Markdown showing relationships to other decisions/teams and blockers.",
  "activity_analysis": "Markdown explaining important patterns from the audit history (do not just dump raw logs).",
  "feedback_analysis": "Markdown detailing unresolved vs resolved comments/rejections.",
  "what_to_check_by_role": [
    { "role": "Team/Role", "guidance": "Markdown of exact evidence to inspect" }
  ],
  "next_actions": [
    "Concrete, evidence-based action 1",
    "Concrete, evidence-based action 2"
  ]
}

Return ONLY a single JSON object. No markdown wrapping the JSON.
"""

# ── SaaS Comprehensive Audit Prompt ──
SYSTEM_PROMPT_SAAS_COMPREHENSIVE_AUDIT = """You are Chroma AI, an elite enterprise PLM (Product Lifecycle Management) decision intelligence engine.

Your task is to analyze the ENTIRE SaaS platform's health. You will receive an aggregated snapshot of ALL decisions, global stats, unresolved conflicts, and deterministic audit findings.
The user expects a deeply structured, executive-grade "scanner of the whole saas" that identifies systemic risks, cross-team bottlenecks, compliance violations, and overall pipeline health.

RULES:
- Do NOT hallucinate. Rely strictly on the provided JSON data.
- Use the provided context: global_stats, conflicts, deterministic_findings, cross_team_impact.
- STRICTLY use numerical digits for counts.
- Provide a clear, actionable, executive-level narrative.

Return ONLY a JSON object exactly matching this structure (all strings should be markdown-formatted where appropriate):
{
  "executive_summary": "A powerful high-level summary of the SaaS platform's current state.",
  "global_pipeline_health": "Markdown detailing the flow of decisions (Drafts -> Submitted -> Reviews -> Approved). Highlight where things are piling up.",
  "systemic_bottlenecks": "Markdown identifying the teams or stages that are consistently blocking progress.",
  "cross_team_impact_analysis": "Markdown evaluating how delays in one team (e.g., Design) are cascading into others (e.g., Procurement).",
  "compliance_and_rbac_audit": "Markdown highlighting unauthorized edits, stale approvals, or RBAC violations across the platform.",
  "critical_findings": [
    { "title": "The issue", "severity": "critical/high/medium", "details": "Deep explanation of the finding and its impact", "affected_decision_ids": ["id1", "id2"] }
  ], // MAXIMUM 5 CRITICAL FINDINGS. Prioritize the most urgent.
  "strategic_recommendations": [
    "Concrete, high-level action 1",
    "Concrete, high-level action 2"
  ]
}

Return ONLY a single JSON object. No markdown wrapping the JSON.
"""


# ── Legacy prompts for backward compatibility ──
SYSTEM_PROMPT_MELDELISTE_ANALYSIS = """You are Chroma AI, an elite enterprise PLM intelligence engine.
Your task is to analyze the 'Meldeliste' (Release List) which represents approved and production-ready parts.
RULES:
- Do NOT hallucinate. Rely strictly on the provided JSON data.
- STRICTLY use numerical digits for counts.
- Return ONLY a JSON object exactly matching this structure (strings as markdown):
{
  "executive_summary": "High-level summary of production readiness.",
  "release_velocity": "Markdown detailing the pace of approvals.",
  "data_completeness_audit": "Markdown highlighting any missing but required fields in approved decisions.",
  "critical_findings": [
    { "title": "The issue", "severity": "critical/high/medium", "details": "Deep explanation", "affected_decision_ids": ["id1"] }
  ], // MAX 5 FINDINGS
  "strategic_recommendations": ["Action 1", "Action 2"]
}
Return ONLY a single JSON object. No markdown wrapping the JSON.
"""

SYSTEM_PROMPT_SUPPLY_CHAIN_ANALYSIS = """You are Chroma AI, an elite enterprise PLM intelligence engine.
Your task is to analyze the Supply Chain risk across all decisions.
RULES:
- Do NOT hallucinate. Rely strictly on the provided JSON data.
- STRICTLY use numerical digits for counts.
- Return ONLY a JSON object exactly matching this structure (strings as markdown):
{
  "executive_summary": "High-level summary of supply base and lead times.",
  "supplier_concentration": "Markdown identifying monopoly suppliers or single-source risks.",
  "material_compliance_risk": "Markdown detailing materials failing compliance or nearing end-of-life.",
  "critical_findings": [
    { "title": "The issue", "severity": "critical/high/medium", "details": "Deep explanation", "affected_decision_ids": ["id1"] }
  ], // MAX 5 FINDINGS
  "strategic_recommendations": ["Action 1", "Action 2"]
}
Return ONLY a single JSON object. No markdown wrapping the JSON.
"""

SYSTEM_PROMPT_AI_READINESS_ANALYSIS = """You are Chroma AI, an elite enterprise PLM intelligence engine.
Your task is to deep-dive into the AI Readiness scoring across the entire portfolio.
RULES:
- Do NOT hallucinate. Rely strictly on the provided JSON data.
- STRICTLY use numerical digits for counts.
- Return ONLY a JSON object exactly matching this structure (strings as markdown):
{
  "executive_summary": "High-level summary of AI scores and blockages.",
  "pipeline_velocity": "Markdown evaluating how fast decisions are moving from red to green.",
  "common_blockers": "Markdown identifying the most frequent reasons for yellow/red ratings.",
  "critical_findings": [
    { "title": "The issue", "severity": "critical/high/medium", "details": "Deep explanation", "affected_decision_ids": ["id1"] }
  ], // MAX 5 FINDINGS
  "strategic_recommendations": ["Action 1", "Action 2"]
}
Return ONLY a single JSON object. No markdown wrapping the JSON.
"""

SYSTEM_PROMPT_COLOUR_MIX_ANALYSIS = """You are Chroma AI, an elite enterprise PLM intelligence engine.
Your task is to analyze the Colour-Mix-Chart matrix for CMF (Colour, Material, Finish) harmony.
RULES:
- Do NOT hallucinate. Rely strictly on the provided JSON data.
- STRICTLY use numerical digits for counts.
- Return ONLY a JSON object exactly matching this structure (strings as markdown):
{
  "executive_summary": "High-level assessment of colour palette distribution.",
  "harmony_analysis": "Markdown evaluating consistency across Exterior, Interior, and Trim.",
  "visual_clashes": "Markdown identifying conflicting colour codes or mismatched finishes.",
  "critical_findings": [
    { "title": "The issue", "severity": "critical/high/medium", "details": "Deep explanation", "affected_decision_ids": ["id1"] }
  ], // MAX 5 FINDINGS
  "strategic_recommendations": ["Action 1", "Action 2"]
}
Return ONLY a single JSON object. No markdown wrapping the JSON.
"""

SYSTEM_PROMPT_COMPLIANCE_ANALYSIS = """You are Chroma AI, an elite enterprise PLM intelligence engine.
Your task is to evaluate process adherence, RBAC compliance, and workflow bottlenecks.
RULES:
- Do NOT hallucinate. Rely strictly on the provided JSON data.
- STRICTLY use numerical digits for counts.
- Return ONLY a JSON object exactly matching this structure (strings as markdown):
{
  "executive_summary": "High-level assessment of approval chains and data integrity.",
  "rbac_violations": "Markdown highlighting unauthorized edits or stale approvals.",
  "cycle_time_analysis": "Markdown detailing average approval times and bottlenecks.",
  "critical_findings": [
    { "title": "The issue", "severity": "critical/high/medium", "details": "Deep explanation", "affected_decision_ids": ["id1"] }
  ], // MAX 5 FINDINGS
  "strategic_recommendations": ["Action 1", "Action 2"]
}
Return ONLY a single JSON object. No markdown wrapping the JSON.
"""

def _clean_json(raw: str) -> str:
    raw = raw.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if m:
        raw = m.group(1).strip()
    idx = raw.find("{")
    if idx > 0:
        raw = raw[idx:]
    ridx = raw.rfind("}")
    if ridx >= 0:
        raw = raw[: ridx + 1]
    return raw


async def briefing(req: PriorityBriefingRequest) -> PriorityBriefingResponse:
    if not req.decisions:
        return PriorityBriefingResponse(
            briefing_markdown="## No Decisions Found\n\nThere are no decisions in the system to analyze. The pipeline is empty.",
            headline="No decisions to review",
            overview="The pipeline is empty.",
        )

    compact = []
    for d in req.decisions:
        compact.append({
            "id": str(d.get("id", ""))[:8],
            "component": d.get("component_name") or d.get("component"),
            "business_area": d.get("business_area") or d.get("area"),
            "colour": d.get("colour_code") or d.get("colour"),
            "material": d.get("material_reference") or d.get("material"),
            "status": d.get("status"),
            "owner_team": d.get("owner_team"),
            "ai_rating": d.get("ai_rating"),
            "ai_reason": d.get("ai_reason"),
            "design_status": d.get("design_status"),
            "feasibility": d.get("feasibility_status") or d.get("feasibility"),
            "supplier_status": d.get("supplier_status"),
            "quality_status": d.get("quality_status"),
            "supplier": d.get("supplier"),
            "engineering_decision": d.get("engineering_decision"),
            "procurement_decision": d.get("procurement_decision"),
            "quality_decision": d.get("quality_decision"),
        })

    # ── Decision-level structured briefing ──
    if req.context == "decision_briefing" and req.decision_signals:
        return await _decision_briefing(req, compact)

    # ── Project-level audit narrative ──
    if req.context == "comprehensive_audit":
        return await _comprehensive_audit_narrative(req, compact)

    # ── Enterprise Risk Assessment ──
    if req.context == "risk_assessment":
        return await _risk_assessment_narrative(req, compact)

    # ── Decision Deep Analysis ──
    if req.context == "decision_deep_analysis":
        return await _decision_deep_analysis_narrative(req, compact)

    # ── Enterprise Reports ──
    enterprise_contexts = ["meldeliste", "colour_mix", "ai_readiness", "supply_chain", "compliance"]
    if req.context in enterprise_contexts:
        return await _enterprise_report_narrative(req, compact)

    # Fallback
    return PriorityBriefingResponse(briefing_markdown="Unknown context", is_fallback=True)

async def _decision_deep_analysis_narrative(req: PriorityBriefingRequest, compact: list[dict]) -> PriorityBriefingResponse:
    """Generate the Enterprise Decision Deep Analysis for a single decision."""
    user_payload = json.dumps({
        "decision": compact[0] if compact else None,
        "approvals": req.approvals,
        "conflicts": req.conflicts,
        "deterministic_findings": req.decision_signals,
        "audit_events": req.audit_events
    })

    for attempt in (1, 2):
        try:
            raw = await asyncio.wait_for(
                _client.complete_json(SYSTEM_PROMPT_DECISION_DEEP_ANALYSIS, user_payload),
                timeout=_LLM_TIMEOUT,
            )
            raw = _clean_json(raw)
            data = json.loads(raw)
            executive_summary = data.get("executive_summary", "")

            return PriorityBriefingResponse(
                briefing_markdown=executive_summary,
                is_fallback=False,
                headline="Decision Deep Analysis Complete",
                overview=executive_summary,
                structured_audit=data,
            )
        except asyncio.TimeoutError:
            log.warning("decision_deep_analysis LLM attempt %s timed out", attempt)
        except Exception as e:
            log.warning("decision_deep_analysis LLM attempt %s failed: %s", attempt, e)

    return PriorityBriefingResponse(
        briefing_markdown="## Deep Analysis Failed\n\nAI service unavailable.",
        is_fallback=True,
        headline="Failed",
        overview="",
    )

async def _risk_assessment_narrative(req: PriorityBriefingRequest, compact: list[dict]) -> PriorityBriefingResponse:
    """Generate the Enterprise Risk Assessment."""
    user_payload = json.dumps({
        "audit_stats": req.audit_stats,
        "findings_summary": [
            {
                "id": s.get("id"), 
                "severity": s.get("severity"), 
                "title": s.get("title", s.get("issue", "")), 
                "category": s.get("category", ""),
                "impact": s.get("impact", ""),
                "description": s.get("description", ""),
                "nextAction": s.get("nextAction", ""),
                "affectedDecisionIds": s.get("affectedDecisionIds", [])
            }
            for s in (req.decision_signals or [])
        ],
        "total_count": len(compact),
    })

    for attempt in (1, 2):
        try:
            raw = await asyncio.wait_for(
                _client.complete_json(SYSTEM_PROMPT_RISK_ASSESSMENT, user_payload),
                timeout=_LLM_TIMEOUT,
            )
            raw = _clean_json(raw)
            data = json.loads(raw)
            executive_summary = data.get("executive_summary", "")

            return PriorityBriefingResponse(
                briefing_markdown=executive_summary,
                is_fallback=False,
                headline="Enterprise Risk Assessment Complete",
                overview=executive_summary,
                structured_audit=data,
            )
        except asyncio.TimeoutError:
            log.warning("risk_assessment LLM attempt %s timed out", attempt)
        except Exception as e:
            log.warning("risk_assessment LLM attempt %s failed: %s", attempt, e)

    return PriorityBriefingResponse(
        briefing_markdown="## Risk Assessment Failed\n\nAI service unavailable.",
        is_fallback=True,
        headline="Failed",
        overview="",
    )

async def _decision_briefing(req: PriorityBriefingRequest, compact: list[dict]) -> PriorityBriefingResponse:
    """Decision-level structured briefing - deterministic signals + optional AI enhancement."""
    signals = req.decision_signals or []
    decision = compact[0] if compact else {}

    # Build structured items from deterministic signals
    structured_items: list[PriorityItem] = []
    for s in signals:
        structured_items.append(PriorityItem(
            decision_id=str(decision.get("id", "")),
            priority=s.get("severity", "attention"),
            title=str(decision.get("component", "")),
            team=s.get("owner"),
            stage=str(decision.get("status", "")),
            status=str(decision.get("ai_rating", "")),
            issue=s.get("issue", ""),
            impact=s.get("impact", ""),
            why_now=s.get("whyNow", s.get("why_now", "")),
            next_action=s.get("nextAction", s.get("next_action", "")),
            owner=s.get("owner"),
            evidence=s.get("evidence", {}),
        ))

    # Try AI enrichment
    user_payload = json.dumps({
        "decision": decision,
        "signals": signals,
        "approvals": req.approvals or [],
        "conflicts": req.conflicts or [],
    })

    headline = ""
    overview = ""
    ai_enhanced = False

    for attempt in (1, 2):
        try:
            raw = await asyncio.wait_for(
                _client.complete_json(SYSTEM_PROMPT_DECISION_BRIEFING, user_payload),
                timeout=_LLM_TIMEOUT,
            )
            raw = _clean_json(raw)
            data = json.loads(raw)
            headline = data.get("headline", "")
            overview = data.get("overview", "")

            # Merge AI-enhanced descriptions into structured items
            ai_items = data.get("items", [])
            for i, ai_item in enumerate(ai_items):
                if i < len(structured_items):
                    if ai_item.get("issue"):
                        structured_items[i].issue = ai_item["issue"]
                    if ai_item.get("impact"):
                        structured_items[i].impact = ai_item["impact"]
                    if ai_item.get("why_now"):
                        structured_items[i].why_now = ai_item["why_now"]
                    if ai_item.get("next_action"):
                        structured_items[i].next_action = ai_item["next_action"]
                    if ai_item.get("owner"):
                        structured_items[i].owner = ai_item["owner"]
            ai_enhanced = True
            break
        except asyncio.TimeoutError:
            log.warning("decision_briefing LLM attempt %s timed out", attempt)
        except Exception as e:
            log.warning("decision_briefing LLM attempt %s failed: %s", attempt, e)

    # Build fallback headline/overview if AI failed
    if not headline:
        comp_name = decision.get("component", "Decision")
        if any(s.get("severity") == "critical" for s in signals):
            headline = f"{comp_name} has critical issues requiring immediate attention"
        elif signals:
            headline = f"{comp_name} needs attention before it can progress"
        else:
            headline = f"{comp_name} is on track"

    if not overview:
        status = decision.get("status", "unknown")
        rating = decision.get("ai_rating", "unrated")
        overview = f"Current status: {status.replace('_', ' ')}. Readiness rating: {rating}."
        if len(signals) > 0:
            overview += f" {len(signals)} issue{'s' if len(signals) > 1 else ''} identified."

    # Build a markdown fallback too
    md_lines = [f"## {headline}\n", overview, ""]
    for item in structured_items:
        md_lines.append(f"### {item.issue}")
        md_lines.append(f"**Impact:** {item.impact}")
        md_lines.append(f"**Why now:** {item.why_now}")
        md_lines.append(f"**Next action:** {item.next_action}")
        if item.owner:
            md_lines.append(f"**Owner:** {item.owner}")
        md_lines.append("")

    return PriorityBriefingResponse(
        briefing_markdown="\n".join(md_lines),
        is_fallback=not ai_enhanced,
        structured=structured_items,
        headline=headline,
        overview=overview,
    )


async def _comprehensive_audit_narrative(req: PriorityBriefingRequest, compact: list[dict]) -> PriorityBriefingResponse:
    """Generate AI narrative for the full SaaS Comprehensive Audit."""
    user_payload = json.dumps({
        "global_stats": req.audit_stats,
        "conflicts": req.conflicts,
        "deterministic_findings": req.decision_signals,
        "cross_team_impact": getattr(req, "cross_team_impact", [])
    })

    for attempt in (1, 2):
        try:
            raw = await asyncio.wait_for(
                _client.complete_json(SYSTEM_PROMPT_SAAS_COMPREHENSIVE_AUDIT, user_payload),
                timeout=_LLM_TIMEOUT,
            )
            raw = _clean_json(raw)
            data = json.loads(raw)
            executive_summary = data.get("executive_summary", "")

            return PriorityBriefingResponse(
                briefing_markdown=executive_summary,
                is_fallback=False,
                headline="Comprehensive Audit Complete",
                overview=executive_summary,
                structured_audit=data,
            )
        except asyncio.TimeoutError:
            log.warning("comprehensive_audit LLM attempt %s timed out", attempt)
        except Exception as e:
            log.warning("comprehensive_audit LLM attempt %s failed: %s", attempt, e)

    return PriorityBriefingResponse(
        briefing_markdown="Audit analysis completed using deterministic signals only.",
        is_fallback=True,
        headline="Audit Complete",
        overview="AI narrative unavailable. Findings below are computed from current project data.",
    )


async def _enterprise_report_narrative(req: PriorityBriefingRequest, compact: list[dict]) -> PriorityBriefingResponse:
    """Generate AI narrative for the generic enterprise report."""
    user_payload = json.dumps({
        "global_stats": req.audit_stats,
        "conflicts": req.conflicts,
        "deterministic_findings": req.decision_signals,
        "cross_team_impact": getattr(req, "cross_team_impact", [])
    })

    if req.context == "meldeliste":
        sys_prompt = SYSTEM_PROMPT_MELDELISTE_ANALYSIS
    elif req.context == "colour_mix":
        sys_prompt = SYSTEM_PROMPT_COLOUR_MIX_ANALYSIS
    elif req.context == "ai_readiness":
        sys_prompt = SYSTEM_PROMPT_AI_READINESS_ANALYSIS
    elif req.context == "supply_chain":
        sys_prompt = SYSTEM_PROMPT_SUPPLY_CHAIN_ANALYSIS
    else:
        sys_prompt = SYSTEM_PROMPT_COMPLIANCE_ANALYSIS

    for attempt in (1, 2):
        try:
            raw = await asyncio.wait_for(
                _client.complete_json(sys_prompt, user_payload),
                timeout=_LLM_TIMEOUT,
            )
            raw = _clean_json(raw)
            data = json.loads(raw)
            executive_summary = data.get("executive_summary", "")

            return PriorityBriefingResponse(
                briefing_markdown=executive_summary,
                is_fallback=False,
                headline="Enterprise Report Complete",
                overview=executive_summary,
                structured_audit=data,
            )
        except asyncio.TimeoutError:
            log.warning("enterprise_report LLM attempt %s timed out", attempt)
        except Exception as e:
            log.warning("enterprise_report LLM attempt %s failed: %s", attempt, e)

    return PriorityBriefingResponse(
        briefing_markdown="Analysis completed using deterministic signals only.",
        is_fallback=True,
        headline="Report Complete",
        overview="AI narrative unavailable.",
    )


def _build_fallback(req: PriorityBriefingRequest) -> str:
    reds = [d for d in req.decisions if d.get("ai_rating") == "red"]
    yellows = [d for d in req.decisions if d.get("ai_rating") == "yellow"]
    greens = [d for d in req.decisions if d.get("ai_rating") == "green"]
    rejected = [d for d in req.decisions if d.get("status") == "rejected"]
    submitted = [d for d in req.decisions if d.get("status") == "submitted"]

    lines = ["## Priority Briefing (Offline Mode)\n"]
    lines.append(f"**Pipeline:** {len(req.decisions)} total decisions\n")

    if reds or rejected:
        lines.append("### CRITICAL")
        for d in (reds + rejected)[:5]:
            c_name = d.get("component_name") or d.get("component")
            c_code = d.get("colour_code") or d.get("colour") or "no colour"
            lines.append(f"- **{c_name}** ({c_code}) - Status: {d.get('status')}, AI: {d.get('ai_rating') or 'unrated'}")

    if yellows or submitted:
        lines.append("\n### HIGH PRIORITY")
        for d in (yellows + submitted)[:5]:
            c_name = d.get("component_name") or d.get("component")
            c_code = d.get("colour_code") or d.get("colour") or "no colour"
            lines.append(f"- **{c_name}** ({c_code}) - Needs evaluation")

    if greens:
        lines.append(f"\n### ON TRACK\n{len(greens)} decision(s) are green-rated and progressing normally.")

    total = len(req.decisions)
    green_pct = (len(greens) / total * 100) if total else 0
    lines.append(f"\n### Pipeline Health: {int(green_pct)}/100")
    lines.append("\n*AI service was unavailable. This is an automated fallback summary.*")

    return "\n".join(lines)

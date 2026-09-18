import { useState, useEffect } from "react";
import { AlertTriangle, X, Shield, Zap, Aperture, Clock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Decision, Approval, Conflict } from "../types/db";
import { getUsesRemaining, consumeUse, getMaxDailyUses, restoreUse } from "../lib/aiQuota";
import { useAuth } from "../auth/AuthContext";
import { getDecisionSignals } from "../lib/auditSignals";
import LogoMark from "./LogoMark";

const AI_API = import.meta.env.VITE_AI_API_URL || "http://localhost:8000";
const FEATURE_KEY = "priority_briefing";

interface PriorityBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  decision: Decision;
  approvals: Approval[];
  conflicts: Conflict[];
}

// Structured response types from backend
interface PriorityItem {
  issue: string;
  impact: string;
  why_now: string;
  next_action: string;
  owner: string | null;
  priority: string;
  title: string;
  evidence: Record<string, any>;
}

interface BriefingResponse {
  briefing_markdown: string;
  is_fallback: boolean;
  structured?: PriorityItem[];
  headline?: string;
  overview?: string;
}

export default function PriorityBriefingModal({ isOpen, onClose, decision, approvals, conflicts }: PriorityBriefingModalProps) {
  const [data, setData] = useState<BriefingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const { profile, role } = useAuth();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    setRemaining(getUsesRemaining(FEATURE_KEY, role, profile?.id));
  }, [role, profile?.id]);

  useEffect(() => {
    if (!isOpen) {
      setData(null);
      setQuotaError(false);
      setRemaining(getUsesRemaining(FEATURE_KEY, role, profile?.id));
      return;
    }

    // Check quota
    if (!consumeUse(FEATURE_KEY, role, profile?.id)) {
      setQuotaError(true);
      setRemaining(0);
      return;
    }

    setRemaining(getUsesRemaining(FEATURE_KEY, role, profile?.id));
    let cancelled = false;

    async function fetchBriefing() {
      setLoading(true);
      
      // Calculate frontend signals to send to the backend
      const signals = getDecisionSignals(decision, approvals, conflicts);

      try {
        const res = await fetch(`${AI_API}/priority-briefing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            decisions: [decision], 
            context: "decision_briefing",
            decision_signals: signals,
            approvals,
            conflicts,
          }),
        });

        if (!res.ok) throw new Error("Failed to generate briefing");

        const json = await res.json() as BriefingResponse;
        
        if (json.is_fallback) {
          restoreUse(FEATURE_KEY, profile?.id);
          setRemaining(getUsesRemaining(FEATURE_KEY, role, profile?.id));
        }

        if (!cancelled) setData(json);
      } catch (err) {
        console.error(err);
        restoreUse(FEATURE_KEY, profile?.id);
        setRemaining(getUsesRemaining(FEATURE_KEY, role, profile?.id));
        if (!cancelled) {
          setData({
            briefing_markdown: "⚠️ Failed to connect to AI service.",
            is_fallback: true,
            headline: "Connection Failed",
            overview: "Could not retrieve briefing. Your quota has been refunded.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBriefing();
    return () => { cancelled = true; };
  }, [isOpen, decision.id]);

  if (!isOpen) return null;

  const hasStructured = data?.structured && data.structured.length > 0;

  return (
    <div className="cs-guide-modal" style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "1rem"
    }}>
      <div className="cs-guide-modal-panel" style={{
        background: "var(--bg-1)", width: "100%", maxWidth: "680px", maxHeight: "90vh", borderRadius: "var(--r-xl)",
        border: "1px solid var(--border)", display: "flex", flexDirection: "column",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 40px rgba(0, 0, 0, 0.05)", overflow: "hidden"
      }}>
        {/* Header */}
        <div className="cs-guide-modal-header" style={{
          padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(to right, rgba(77, 166, 255, 0.05), transparent)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(77,166,255,0.15) 0%, rgba(139,92,246,0.1) 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--accent)", boxShadow: "0 0 15px rgba(77,166,255,0.2)"
            }}>
              <LogoMark size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text-0)", fontWeight: 600 }}>AI Deep Analysis</h2>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: 3 }}>
                <div style={{ fontSize: "0.625rem", color: "var(--accent)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Chroma Sync AI
                </div>
                <div style={{
                  fontSize: "0.5625rem", color: "var(--text-3)", fontWeight: 500,
                  display: "flex", alignItems: "center", gap: "3px"
                }}>
                  <Zap size={8} /> {remaining}/{getMaxDailyUses(role)} uses left today
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--bg-2)", border: "1px solid var(--border)",
              color: "var(--text-1)", cursor: "pointer",
              width: 28, height: 28, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s"
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--bg-3)"}
            onMouseLeave={e => e.currentTarget.style.background = "var(--bg-2)"}
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="cs-guide-modal-content" style={{ padding: "1.5rem", flex: 1, overflowY: "auto", minHeight: 300, position: "relative" }}>
          
          {quotaError ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "1rem", padding: "2rem", textAlign: "center", height: "100%"
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <AlertTriangle size={28} style={{ color: "#f59e0b" }} />
              </div>
              <div>
                <div style={{ color: "var(--text-0)", fontWeight: 600, fontSize: "1rem", marginBottom: "0.5rem" }}>
                  Daily Quota Reached
                </div>
                <div style={{ color: "var(--text-2)", fontSize: "0.875rem", lineHeight: 1.5 }}>
                  You've used all <strong>{getMaxDailyUses()}</strong> AI briefings for today.<br />
                  Your quota resets at midnight.
                </div>
              </div>
            </div>
          ) : loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div className="skeleton skeleton-heading" />
              <div className="skeleton skeleton-text long" />
              <div className="skeleton skeleton-text medium" />
              <div style={{ marginTop: "1rem" }}>
                <div className="skeleton skeleton-card" style={{ height: "180px" }} />
              </div>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                 <div className="ai-core-loader">
                  <div className="ai-core-ring"></div>
                  <div className="ai-core-ring-inner"></div>
                  <div className="ai-core-icon">
                    <LogoMark size={32} />
                  </div>
                </div>
                <div style={{ color: "var(--accent)", fontSize: "0.8125rem", fontWeight: 500, letterSpacing: "0.02em" }}>
                  Generating briefing...
                </div>
              </div>
            </div>
          ) : data ? (
            <div className="ai-report-content" style={{ padding: 0 }}>
              
              <div style={{ marginBottom: "2rem" }}>
                <h1 style={{ marginTop: 0, marginBottom: "0.5rem" }}>{data.headline || decision.component_name}</h1>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-2)", margin: 0 }}>
                  {data.overview}
                </p>
              </div>

              {hasStructured ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  {data.structured!.map((item, idx) => (
                    <div key={idx} className="card" style={{ 
                      padding: 0, 
                      overflow: "hidden",
                      borderLeft: item.priority === "critical" ? "4px solid var(--red)" : 
                                 item.priority === "attention" ? "4px solid var(--amber)" : 
                                 "4px solid var(--green)"
                    }}>
                      <div style={{ padding: "1.25rem 1.5rem" }}>
                        <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-0)", marginBottom: "1rem", lineHeight: 1.4 }}>
                          {item.issue}
                        </div>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
                          
                          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", background: "var(--bg-0)", padding: "0.875rem", borderRadius: "var(--r-sm)", border: "1px solid var(--border)" }}>
                            <div style={{ width: "80px", flexShrink: 0, fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Impact</div>
                            <div style={{ fontSize: "0.8125rem", color: "var(--text-1)", lineHeight: 1.5 }}>{item.impact}</div>
                          </div>
                          
                          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", background: "var(--bg-0)", padding: "0.875rem", borderRadius: "var(--r-sm)", border: "1px solid var(--border)" }}>
                            <div style={{ width: "80px", flexShrink: 0, fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Why Now</div>
                            <div style={{ fontSize: "0.8125rem", color: "var(--text-1)", lineHeight: 1.5 }}>{item.why_now}</div>
                          </div>

                        </div>

                        <div style={{ marginTop: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", paddingTop: "1.25rem", borderTop: "1px solid var(--border)" }}>
                          <div style={{ flex: 1, minWidth: "200px" }}>
                            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.25rem" }}>Next Action</div>
                            <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-0)" }}>{item.next_action}</div>
                          </div>
                          {item.owner && (
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.25rem" }}>Owner</div>
                              <span className="badge badge-neutral">{item.owner}</span>
                            </div>
                          )}
                        </div>
                        
                        {item.evidence && Object.keys(item.evidence).length > 0 && (
                          <div className="briefing-evidence">
                            {Object.entries(item.evidence).slice(0, 4).map(([key, val]) => (
                              <div key={key} className="briefing-evidence-item">
                                <div className="briefing-evidence-label">{key.replace(/_/g, ' ')}</div>
                                <div className="briefing-evidence-value">{String(val || "None")}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  background: "var(--bg-0)", padding: "1.5rem", borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)", fontSize: "0.875rem", color: "var(--text-1)",
                }}>
                  <ReactMarkdown>{data.briefing_markdown}</ReactMarkdown>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{
          padding: "0.875rem 1.5rem", borderTop: "1px solid var(--border)", background: "var(--bg-0)",
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>Powered by</span>
            <LogoMark size={14} />
            <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-1)", letterSpacing: "0.05em" }}>CHROMA AI</span>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>
            Close Briefing
          </button>
        </div>
      </div>
    </div>
  );
}

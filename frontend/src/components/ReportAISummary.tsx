import { useState, useEffect } from "react";
import { Aperture, Zap, X, AlertTriangle, Sparkles, TrendingUp, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { getUsesRemaining, consumeUse, getMaxDailyUses, restoreUse } from "../lib/aiQuota";
import LogoMark from "./LogoMark";
import { useAuth } from "../auth/AuthContext";

const AI_API = import.meta.env.VITE_AI_API_URL || "http://localhost:8000";

interface Props {
  /** A unique key for this report's AI quota, e.g. "meldeliste_ai" */
  featureKey: string;
  /** The data payload to send to the AI service */
  payload: Record<string, unknown>;
  /** Title shown in the AI summary card */
  title?: string;
}

/**
 * Premium AI insight overlay for report pages.
 * Sends the report data to /my-summary and renders the markdown response
 * in a beautifully styled full-screen modal – matching PriorityBriefingModal quality.
 */
export default function ReportAISummary({ featureKey, payload, title = "AI Insights" }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState(false);
  const { profile, role } = useAuth();
  const [remaining, setRemaining] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  // Initialize remaining quota once profile is loaded
  useEffect(() => {
    setRemaining(getUsesRemaining(featureKey, role, profile?.id));
  }, [featureKey, role, profile?.id]);

  async function generate() {
    if (!consumeUse(featureKey, role, profile?.id)) {
      setQuotaError(true);
      setRemaining(0);
      setIsOpen(true);
      return;
    }
    setRemaining(getUsesRemaining(featureKey, role, profile?.id));
    setLoading(true);
    setError(null);
    setSummary(null);
    setIsOpen(true);

    try {
      const res = await fetch(`${AI_API}/report-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          feature_key: featureKey,
          payload,
          user_id: profile?.id 
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const data = await res.json();

      if (data.is_fallback) {
        restoreUse(featureKey, profile?.id);
        setRemaining(getUsesRemaining(featureKey, role, profile?.id));
      }
      setSummary(data.summary_markdown);
    } catch (err) {
      console.error("Report AI summary error:", err);
      restoreUse(featureKey, profile?.id);
      setRemaining(getUsesRemaining(featureKey, role, profile?.id));
      setError("AI service unavailable. Your quota has been refunded.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setIsOpen(false);
  }

  // Parse markdown sections for structured rendering


  return (
    <>
      {/* Trigger Button - premium inline card */}
      <div className="card" style={{
        padding: 0, overflow: "hidden", marginBottom: "1.5rem",
        border: "1px solid rgba(77,166,255,0.15)",
        background: "linear-gradient(135deg, rgba(77,166,255,0.03), rgba(139,92,246,0.02))"
      }}>
        <div style={{
          padding: "0.875rem 1.25rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "10px",
              background: "linear-gradient(135deg, rgba(77,166,255,0.15), rgba(139,92,246,0.1))",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--accent)", boxShadow: "0 0 12px rgba(77,166,255,0.1)"
            }}>
              <LogoMark size={16} />
            </div>
            <div>
              <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-0)" }}>{title}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: 1 }}>
                <span style={{
                  fontSize: "0.5rem", fontWeight: 700, color: "var(--accent)",
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  background: "rgba(77,166,255,0.1)", padding: "1px 6px", borderRadius: "3px"
                }}>AI-Powered</span>
                <span style={{ fontSize: "0.5625rem", color: "var(--text-3)", display: "flex", alignItems: "center", gap: "3px" }}>
                  <Zap size={7} /> {remaining}/{getMaxDailyUses(role)} left
                </span>
              </div>
            </div>
          </div>
          <button
            className="btn btn-accent"
            onClick={generate}
            disabled={loading || quotaError}
            style={{ fontSize: "0.6875rem", padding: "0.375rem 1rem", display: "flex", alignItems: "center", gap: "0.375rem" }}
          >
            <LogoMark size={14} /> Generate Insights
          </button>
        </div>
      </div>

      {/* Full-screen Premium Modal */}
      {isOpen && (
        <div className="cs-guide-modal" style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999, padding: "1rem"
        }}>
          <div className="cs-guide-modal-panel" style={{
            background: "var(--bg-1)", width: "100%", maxWidth: "680px", maxHeight: "90vh",
            borderRadius: "var(--r-xl)", border: "1px solid var(--border)",
            display: "flex", flexDirection: "column",
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
                  background: "linear-gradient(135deg, rgba(77,166,255,0.15), rgba(139,92,246,0.1))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--accent)", boxShadow: "0 0 15px rgba(77,166,255,0.2)"
                }}>
                  <LogoMark size={20} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text-0)", fontWeight: 600 }}>{title}</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: 3 }}>
                    <div style={{
                      fontSize: "0.625rem", color: "var(--accent)", fontWeight: 700,
                      letterSpacing: "0.08em", textTransform: "uppercase"
                    }}>
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
                onClick={handleClose}
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
            <div className="cs-guide-modal-content" style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
              {quotaError ? (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: "1rem", padding: "3rem", textAlign: "center"
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    <AlertTriangle size={28} style={{ color: "#f59e0b" }} />
                  </div>
                  <div>
                    <div style={{ color: "var(--text-0)", fontWeight: 600, fontSize: "1rem", marginBottom: "0.5rem" }}>Daily Quota Reached</div>
                    <div style={{ color: "var(--text-2)", fontSize: "0.875rem", lineHeight: 1.5 }}>
                      You've used all <strong>{getMaxDailyUses(role)}</strong> AI insights for today.<br />
                      Your quota resets at midnight.
                    </div>
                  </div>
                </div>
              ) : error ? (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: "1rem", padding: "3rem", textAlign: "center"
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: "rgba(248,113,113,0.1)", display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    <AlertTriangle size={28} style={{ color: "var(--red)" }} />
                  </div>
                  <div style={{ color: "var(--text-1)", fontSize: "0.875rem", lineHeight: 1.5 }}>{error}</div>
                </div>
              ) : loading ? (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  flex: 1, gap: "2rem", padding: "4rem 2rem"
                }}>
                  <div className="ai-core-loader">
                    <div className="ai-core-ring" />
                    <div className="ai-core-ring-inner" />
                    <div className="ai-core-icon"><LogoMark size={32} /></div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{
                      color: "var(--text-0)", fontWeight: 700, fontSize: "1.125rem",
                      letterSpacing: "-0.02em", marginBottom: "0.5rem",
                      background: "linear-gradient(135deg, #fff, #94a3b8)",
                      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
                    }}>
                      Chroma AI is analyzing your report data...
                    </div>
                    <div style={{ color: "var(--accent)", fontSize: "0.8125rem", fontWeight: 500, letterSpacing: "0.02em" }}>
                      Synthesizing insights and recommendations
                    </div>
                  </div>
                </div>
              ) : summary ? (
                <div className="markdown-content" style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "var(--text-1)" }}>
                  <ReactMarkdown>{summary}</ReactMarkdown>
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
              <button className="btn btn-secondary" onClick={handleClose}>Close Insights</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

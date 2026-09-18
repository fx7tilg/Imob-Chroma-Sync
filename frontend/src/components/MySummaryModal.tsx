import { useState, useEffect } from "react";
import { Sparkles, X, AlertTriangle, Zap, Aperture } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Decision } from "../types/db";
import { getUsesRemaining, consumeUse, getMaxDailyUses, restoreUse } from "../lib/aiQuota";
import { useAuth } from "../auth/AuthContext";
import LogoMark from "./LogoMark";

const AI_API = import.meta.env.VITE_AI_API_URL || "http://localhost:8000";
const FEATURE_KEY = "my_summary";

interface MySummaryModalProps {
  decisions: Decision[];
  title?: string;
  subtitle?: string;
}

export default function MySummaryModal({ decisions, title = "My Performance Summary", subtitle = "AI Analysis" }: MySummaryModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const { profile, role } = useAuth();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    setRemaining(getUsesRemaining(FEATURE_KEY, role, profile?.id));
  }, [role, profile?.id]);

  async function generate() {
    if (!consumeUse(FEATURE_KEY, role, profile?.id)) {
      setQuotaError(true);
      setRemaining(0);
      setIsOpen(true);
      return;
    }

    setRemaining(getUsesRemaining(FEATURE_KEY, role, profile?.id));
    setLoading(true);
    setSummary(null);
    setIsOpen(true);

    try {
      const res = await fetch(`${AI_API}/my-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions }),
      });
      
      if (!res.ok) throw new Error("Failed to generate summary");
      
      const data = await res.json();

      if (data.is_fallback) {
        restoreUse(FEATURE_KEY, profile?.id);
        setRemaining(getUsesRemaining(FEATURE_KEY, role, profile?.id));
      }

      setSummary(data.summary_markdown);
    } catch (err) {
      console.error(err);
      restoreUse(FEATURE_KEY, profile?.id);
      setRemaining(getUsesRemaining(FEATURE_KEY, role, profile?.id));
      setSummary("⚠️ Failed to generate summary. The AI service might be offline. Your quota has been refunded.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setIsOpen(false);
  }

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

      {isOpen && (
        <div className="cs-guide-modal" style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "1rem"
        }}>
      <div className="cs-guide-modal-panel" style={{
        background: "var(--bg-1)", width: "100%", maxWidth: "680px", maxHeight: "90vh", borderRadius: "var(--r-xl)",
        border: "1px solid var(--border)", display: "flex", flexDirection: "column",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 40px rgba(0, 0, 0, 0.05)", overflow: "hidden"
      }}>
        {/* Header - CCTV Theme */}
        <div className="cs-guide-modal-header" style={{
          padding: "1.25rem 1.5rem",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(90deg, rgba(15, 23, 42, 1) 0%, rgba(30, 27, 75, 1) 100%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--accent)"
            }}>
              <LogoMark size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.125rem", color: "#fff", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", letterSpacing: "0.02em" }}>
                {title}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.6875rem", color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: "0.06em", marginTop: "0.25rem", textTransform: "uppercase" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 8px #ef4444", animation: "pulse 2s infinite" }} />
                {subtitle} • {remaining}/{getMaxDailyUses(role)} left
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="btn btn-primary"
            style={{ padding: "0.4rem 1rem", fontSize: "0.8125rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <X size={14} /> Close
          </button>
        </div>

        {/* Content */}
        <div className="cs-guide-modal-content" style={{ padding: "1.5rem", minHeight: 200, display: "flex", flexDirection: "column", flex: 1, overflowY: "auto" }}>
          {quotaError ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "1rem", padding: "2rem", textAlign: "center"
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
                  You've used all <strong>{getMaxDailyUses(role)}</strong> AI summaries for today.<br />
                  Your quota resets at midnight. Each AI analysis consumes compute resources.
                </div>
              </div>
            </div>
          ) : loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: "2rem", padding: "4rem 2rem" }}>
              <div className="ai-core-loader">
                <div className="ai-core-ring"></div>
                <div className="ai-core-ring-inner"></div>
                <div className="ai-core-icon">
                  <LogoMark size={32} />
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ 
                  color: "var(--text-0)", fontWeight: 700, fontSize: "1.125rem",
                  letterSpacing: "-0.02em", marginBottom: "0.5rem",
                  background: "linear-gradient(135deg, #fff, #94a3b8)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
                }}>
                  Chroma AI is analyzing your performance...
                </div>
                <div style={{ color: "var(--purple)", fontSize: "0.8125rem", fontWeight: 500, letterSpacing: "0.02em" }}>
                  Synthesizing insights from your decision history
                </div>
              </div>
            </div>
          ) : summary ? (
            <div style={{
              background: "var(--bg-0)", padding: "1.25rem", borderRadius: "var(--r-md)",
              border: "1px solid var(--border)", fontSize: "0.875rem", color: "var(--text-1)",
              lineHeight: 1.6
            }} className="markdown-content">
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid var(--border)", background: "var(--bg-0)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>
            Generated by Chroma AI • Personal
          </div>
          <button className="btn btn-primary" onClick={handleClose} style={{ background: "var(--purple)", borderColor: "var(--purple)" }}>
            Close Summary
          </button>
        </div>
      </div>
    </div>
      )}
    </>
  );
}

import { BrainCircuit, Zap, ShieldCheck, Eye, GitBranch } from "lucide-react";
import LogoMark from "./LogoMark";

interface AiDecisionIntelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AiDecisionIntelModal({ isOpen, onClose }: AiDecisionIntelModalProps) {
  if (!isOpen) return null;

  return (
    <div className="cs-guide-modal cs-guide-modal-ai" style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0, 0, 0, 0.8)",
      backdropFilter: "blur(12px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: "1rem"
    }}>
      <div className="cs-guide-modal-panel" style={{
        background: "var(--bg-1)",
        border: "1px solid rgba(77, 166, 255, 0.4)",
        borderRadius: "var(--r-xl)",
        width: "100%",
        maxWidth: "760px",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 0 80px rgba(77, 166, 255, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)",
        overflow: "hidden"
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
              background: "rgba(77, 166, 255, 0.1)",
              border: "1px solid rgba(77, 166, 255, 0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#4da6ff"
            }}>
              <LogoMark size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.125rem", color: "#fff", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", letterSpacing: "0.02em" }}>
                AI Decision Intelligence
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.6875rem", color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: "0.06em", marginTop: "0.25rem", textTransform: "uppercase" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4da6ff", boxShadow: "0 0 8px #4da6ff", animation: "pulse 2s infinite" }} />
                CONTINUOUS INTELLIGENCE
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.1)", border: "none",
              color: "#fff", cursor: "pointer",
              width: 28, height: 28, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s"
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="cs-guide-modal-content" style={{ padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Lifecycle overview */}
          <div style={{
            padding: "1.25rem", borderRadius: "var(--r-md)",
            background: "linear-gradient(135deg, rgba(77, 166, 255, 0.05) 0%, rgba(52, 211, 153, 0.03) 100%)",
            border: "1px solid rgba(77, 166, 255, 0.15)",
            display: "flex", gap: "1rem", alignItems: "flex-start"
          }}>
            <div style={{ color: "#4da6ff", marginTop: "2px" }}><BrainCircuit size={22} /></div>
            <div>
              <h3 style={{ margin: "0 0 0.375rem 0", fontSize: "0.9375rem", color: "var(--text-0)" }}>Decision Lifecycle AI Engagement</h3>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-1)", lineHeight: 1.6 }}>
                The AI engine is not a passive observer. It actively intervenes at every critical transition point in the decision lifecycle. From the moment a decision is created as a Draft, to the final Quality approval, the AI evaluates, validates, and if necessary, blocks progression to prevent human error and ensure strict compliance.
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>

            {/* Card 1: On Submit */}
            <div style={{ background: "var(--bg-0)", padding: "1.25rem", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <Zap size={16} style={{ color: "#f59e0b" }} />
                <h4 style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-0)" }}>On Submission Scan</h4>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                <p style={{ margin: "0 0 0.5rem 0" }}><strong style={{ color: "var(--text-1)" }}>Trigger:</strong> When a Designer clicks "Submit Decision", the AI immediately performs a full 6-point Readiness Criteria (RC) scan before the decision enters the review pipeline.</p>
                <p style={{ margin: 0 }}><strong style={{ color: "var(--text-1)" }}>Auto-Reject:</strong> If any RC evaluates to Red (e.g., orphan material, RBAC violation, or a direct conflict), the submission is automatically rejected with a detailed explanation. The designer must fix the issue and resubmit.</p>
              </div>
            </div>

            {/* Card 2: Rating assignment */}
            <div style={{ background: "var(--bg-0)", padding: "1.25rem", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <ShieldCheck size={16} style={{ color: "#34d399" }} />
                <h4 style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-0)" }}>AI Rating Assignment</h4>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                <p style={{ margin: "0 0 0.5rem 0" }}><strong style={{ color: "var(--text-1)" }}>Green:</strong> All 6 Readiness Criteria are satisfied. The decision is clear for production review.</p>
                <p style={{ margin: "0 0 0.5rem 0" }}><strong style={{ color: "var(--text-1)" }}>Yellow:</strong> No critical blockers, but one or more criteria have warnings (e.g., missing data, single-source supplier).</p>
                <p style={{ margin: 0 }}><strong style={{ color: "var(--text-1)" }}>Red:</strong> At least one criterion has a critical failure. The decision requires immediate attention before it can progress.</p>
              </div>
            </div>

            {/* Card 3: Conflict detection */}
            <div style={{ background: "var(--bg-0)", padding: "1.25rem", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <Eye size={16} style={{ color: "#ec4899" }} />
                <h4 style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-0)" }}>Conflict and Duplicate Detection</h4>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                <p style={{ margin: "0 0 0.5rem 0" }}><strong style={{ color: "var(--text-1)" }}>Same Component Check:</strong> If two decisions target the same component in the same model year but specify different colour codes, materials, or finishes, the AI flags a conflict (RC-6).</p>
                <p style={{ margin: 0 }}><strong style={{ color: "var(--text-1)" }}>Lifecycle Cross-Check:</strong> If one decision uses an Active material and another uses a Deprecated material on the same component, the AI flags a lifecycle conflict to prevent supply chain disruption.</p>
              </div>
            </div>

            {/* Card 4: Version validation */}
            <div style={{ background: "var(--bg-0)", padding: "1.25rem", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <GitBranch size={16} style={{ color: "#8b5cf6" }} />
                <h4 style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-0)" }}>Version Delta Validation</h4>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                <p style={{ margin: "0 0 0.5rem 0" }}><strong style={{ color: "var(--text-1)" }}>On Resubmission:</strong> When a rejected decision is corrected and resubmitted (e.g., v1 to v2), the AI compares the exact fields that changed between versions.</p>
                <p style={{ margin: 0 }}><strong style={{ color: "var(--text-1)" }}>Correction Validation:</strong> It verifies whether the changes actually resolve the original rejection reason. If a designer resubmits without fixing the flagged issue, the AI blocks Quality approval.</p>
              </div>
            </div>
          </div>

          {/* Data sources */}
          <div style={{
            padding: "1rem", background: "var(--bg-0)", borderRadius: "var(--r-md)",
            border: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-2)", lineHeight: 1.6
          }}>
            <strong style={{ color: "var(--text-0)", fontSize: "0.8125rem" }}>Data Sources Used by the AI</strong>
            <ul style={{ margin: "0.5rem 0 0 0", paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <li><strong style={{ color: "var(--text-1)" }}>DiMa Master List:</strong> All registered materials, their lifecycle status, and supplier information.</li>
              <li><strong style={{ color: "var(--text-1)" }}>VRED Visual Validation:</strong> 3D render comparison data for surface finish and colour accuracy.</li>
              <li><strong style={{ color: "var(--text-1)" }}>Approval Chain:</strong> Full RBAC-verified history of who approved what, and when.</li>
              <li><strong style={{ color: "var(--text-1)" }}>Audit Log:</strong> Every field change, status transition, and user action, timestamped and immutable.</li>
              <li><strong style={{ color: "var(--text-1)" }}>Conflict Graph:</strong> Real-time cross-reference of all decisions by component, model year, colour, and material.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "1rem 1.5rem", borderTop: "1px solid var(--border)", background: "var(--bg-0)",
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <span style={{ fontSize: "0.6875rem", color: "var(--text-3)", letterSpacing: "0.02em" }}>
            AI engine is active and monitoring all decisions in real-time.
          </span>
          <button className="btn btn-primary" onClick={onClose} style={{ padding: "0.4rem 1rem", fontSize: "0.8125rem", fontWeight: 600 }}>
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
}

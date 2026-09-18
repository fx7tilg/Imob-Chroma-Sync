import { Shield } from "lucide-react";

interface RCReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RC_DATA = [
  {
    id: "RC-1",
    name: "Material Lifecycle Compliance",
    description: "Validates whether the referenced material exists in the DiMa (Digital Material) master list and checks its lifecycle status.",
    green: "Material exists in DiMa and has an Active lifecycle status.",
    yellow: "Material exists but is flagged as Approaching End-of-Life in the supplier catalogue.",
    red: "Material reference does not exist in DiMa (orphan material), or the material is officially Deprecated.",
    color: "#3b82f6",
  },
  {
    id: "RC-2",
    name: "Supplier Feasibility",
    description: "Assesses whether the material's supplier chain is robust enough for production.",
    green: "Material is multi-sourced from 2 or more qualified suppliers.",
    yellow: "Material is single-sourced but the supplier has confirmed capacity.",
    red: "Material is single-sourced with no confirmed capacity, or the supplier is unqualified for the required process.",
    color: "#8b5cf6",
  },
  {
    id: "RC-3",
    name: "Design Maturity",
    description: "Evaluates the design status of the decision to determine if it is ready for engineering review.",
    green: "Design Status is set to Ready for Engineering or higher.",
    yellow: "Design Status is In Progress with no blocking notes.",
    red: "Design Status is Concept Review or On Hold. Submission is blocked.",
    color: "#06b6d4",
  },
  {
    id: "RC-4",
    name: "Quality Gate Status",
    description: "Checks whether the decision has passed through the full Quality approval gate.",
    green: "All three teams (Engineering, Procurement, Quality) have approved the current version.",
    yellow: "Engineering and Procurement have approved, but Quality review is pending.",
    red: "One or more upstream teams have rejected the decision, or Quality is locked because not all prerequisites are met.",
    color: "#f59e0b",
  },
  {
    id: "RC-5",
    name: "Approval and RBAC Chain",
    description: "Validates that every approval was performed by a user with the correct role-based access.",
    green: "All approvals were performed by users with the Approver role.",
    yellow: "Approval chain is incomplete (some teams have not voted yet).",
    red: "A decision was approved by a user whose role is not Approver (RBAC violation), or the decision was modified after approval without an audit trail.",
    color: "#ef4444",
  },
  {
    id: "RC-6",
    name: "Cross-Decision Conflicts",
    description: "Detects visual and material conflicts between decisions targeting the same component within the same model year.",
    green: "No conflicts detected for this component and model year combination.",
    yellow: "Minor discrepancy detected (e.g., different materials on the same component across business areas).",
    red: "Direct finish conflict, colour code conflict, or lifecycle conflict detected. Two decisions on the same component specify incompatible configurations.",
    color: "#ec4899",
  },
];

export default function RCReferenceModal({ isOpen, onClose }: RCReferenceModalProps) {
  if (!isOpen) return null;

  return (
    <div className="cs-guide-modal cs-guide-modal-rc" style={{
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
        border: "1px solid rgba(139, 92, 246, 0.4)",
        borderRadius: "var(--r-xl)",
        width: "100%",
        maxWidth: "780px",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 0 80px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)",
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
              background: "rgba(139, 92, 246, 0.1)",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#8b5cf6"
            }}>
              <Shield size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.125rem", color: "#fff", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", letterSpacing: "0.02em" }}>
                Readiness Criteria Reference
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.6875rem", color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: "0.06em", marginTop: "0.25rem", textTransform: "uppercase" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#8b5cf6", boxShadow: "0 0 8px #8b5cf6", animation: "pulse 2s infinite" }} />
                6 AI-EVALUATED QUALITY GATES
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
        <div className="cs-guide-modal-content" style={{ padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Aggregate explanation */}
          <div style={{
            padding: "1rem", background: "rgba(99, 102, 241, 0.05)", borderRadius: "var(--r-md)",
            border: "1px solid rgba(99, 102, 241, 0.15)", fontSize: "0.8125rem", color: "var(--text-1)", lineHeight: 1.6
          }}>
            <strong style={{ color: "var(--text-0)" }}>How the Aggregate Score Works:</strong> The overall AI rating for a decision is determined by the worst-case RC. If any single criterion is Red, the entire decision is rated Red. If no criterion is Red but at least one is Yellow, the decision is rated Yellow. Only when all 6 criteria are Green does the decision receive a Green rating.
          </div>

          {/* RC Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            {RC_DATA.map(rc => (
              <div key={rc.id} style={{
                background: "var(--bg-0)", padding: "1rem", borderRadius: "var(--r-md)",
                border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.625rem"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{
                    fontSize: "0.625rem", fontWeight: 800, color: "#fff", background: rc.color,
                    padding: "2px 6px", borderRadius: "var(--r-sm)", letterSpacing: "0.05em"
                  }}>
                    {rc.id}
                  </div>
                  <h4 style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-0)", fontWeight: 600 }}>{rc.name}</h4>
                </div>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-2)", lineHeight: 1.5 }}>{rc.description}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.6875rem", lineHeight: 1.4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)", flexShrink: 0, marginTop: 4 }} />
                    <span style={{ color: "var(--text-1)" }}>{rc.green}</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.6875rem", lineHeight: 1.4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--amber)", flexShrink: 0, marginTop: 4 }} />
                    <span style={{ color: "var(--text-1)" }}>{rc.yellow}</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.6875rem", lineHeight: 1.4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--red)", flexShrink: 0, marginTop: 4 }} />
                    <span style={{ color: "var(--text-1)" }}>{rc.red}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "1rem 1.5rem", borderTop: "1px solid var(--border)", background: "var(--bg-0)",
          display: "flex", justifyContent: "flex-end"
        }}>
          <button className="btn btn-primary" onClick={onClose} style={{ padding: "0.4rem 1rem", fontSize: "0.8125rem", fontWeight: 600 }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

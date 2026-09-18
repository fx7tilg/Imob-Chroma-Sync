import { GitCommitHorizontal, Layers, Undo2 } from "lucide-react";

interface WorkflowGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WorkflowGuideModal({ isOpen, onClose }: WorkflowGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="cs-guide-modal cs-guide-modal-workflow" style={{
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
        border: "1px solid rgba(16, 185, 129, 0.4)",
        borderRadius: "var(--r-xl)",
        width: "100%",
        maxWidth: "680px",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 0 80px rgba(16, 185, 129, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)",
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
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--green)"
            }}>
              <GitCommitHorizontal size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.125rem", color: "#fff", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", letterSpacing: "0.02em" }}>
                Workflow & Versioning Rules
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.6875rem", color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: "0.06em", marginTop: "0.25rem", textTransform: "uppercase" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981", animation: "pulse 2s infinite" }} />
                PLM GOVERNANCE
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
        <div className="cs-guide-modal-content" style={{
          padding: "1.5rem",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "1.75rem"
        }}>
          
          {/* Timeline Process */}
          <section>
            <h3 style={{ fontSize: "0.8125rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-2)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Layers size={14} /> The 4-Stage Lifecyle
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", position: "relative" }}>
              <div style={{ position: "absolute", left: "11px", top: "10px", bottom: "10px", width: "2px", background: "var(--border)", zIndex: 0 }} />
              
              <div style={{ display: "flex", gap: "1rem", position: "relative", zIndex: 1 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bg-1)", border: "2px solid var(--text-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text-3)" }} />
                </div>
                <div>
                  <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "0.9375rem", color: "var(--text-0)" }}>1. Draft Mode (Design)</h4>
                  <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.8125rem", color: "var(--text-1)", lineHeight: 1.5 }}>
                    Decisions start in isolation. The Designer sets parameters, runs AI checks, and iterates without alerting other teams. Only when Design Status is set to <strong>"Ready for Engineering"</strong> can it be submitted.
                  </p>
                  <div style={{ padding: "0.5rem", background: "rgba(251, 191, 36, 0.05)", borderLeft: "3px solid var(--amber)", borderRadius: "var(--r-sm)", fontSize: "0.75rem", color: "var(--text-1)", lineHeight: 1.4 }}>
                    <strong style={{ color: "var(--text-0)" }}>Concepts & WIPs:</strong> If the design is a "Concept Review" or "On Hold", the Submit button is strictly disabled. You must use <strong>"Save as Draft"</strong>. This keeps it editable for Design, while allowing the team to view the concept on the dashboard without triggering a formal review lock.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "1rem", position: "relative", zIndex: 1 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bg-1)", border: "2px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
                </div>
                <div>
                  <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "0.9375rem", color: "var(--text-0)" }}>2. Submitted (Parallel Review)</h4>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-1)", lineHeight: 1.5 }}>
                    Engineering and Procurement receive the decision simultaneously. They can review and approve in parallel independently of each other.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "1rem", position: "relative", zIndex: 1 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bg-1)", border: "2px solid var(--blue)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--blue)" }} />
                </div>
                <div>
                  <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "0.9375rem", color: "var(--text-0)" }}>3. Under Review (Quality Gate)</h4>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-1)", lineHeight: 1.5 }}>
                    Quality acts as the final gatekeeper. They are blocked from acting until <strong>both</strong> Engineering and Procurement have fully approved the current version.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "1rem", position: "relative", zIndex: 1 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bg-1)", border: "2px solid var(--green)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />
                </div>
                <div>
                  <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "0.9375rem", color: "var(--text-0)" }}>4. Approved (Finalized)</h4>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-1)", lineHeight: 1.5 }}>
                    Once Quality approves, the decision is locked and enters production readiness (Meldeliste). Further edits are heavily restricted.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Rejection and Versioning */}
          <section style={{ background: "rgba(239, 68, 68, 0.04)", padding: "1.25rem", borderRadius: "var(--r-md)", border: "1px solid rgba(239, 68, 68, 0.15)" }}>
            <h3 style={{ fontSize: "0.8125rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--red)", margin: "0 0 0.75rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Undo2 size={14} /> Rejections & Version Cascades
            </h3>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-1)", lineHeight: 1.5 }}>
              <p style={{ margin: "0 0 0.75rem 0" }}>
                If <strong>any team</strong> rejects the decision, the workflow immediately halts and returns to Design via the <strong>"Unlock to Fix"</strong> action.
              </p>
              <div style={{ background: "var(--bg-0)", padding: "1rem", borderRadius: "var(--r-sm)", border: "1px solid var(--border)" }}>
                <h5 style={{ margin: "0 0 0.5rem 0", fontSize: "0.8125rem", color: "var(--text-0)" }}>What happens on re-submission?</h5>
                <ul style={{ margin: "0 0 0.75rem 0", paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  <li>The <strong>Version bumps</strong> (e.g., v1 → v2) to maintain a pristine audit trail.</li>
                  <li><strong>ALL downstream approvals are wiped.</strong> Even if Engineering approved v1, they must re-review v2 because the core data has changed.</li>
                  <li>This guarantees that no team signs off on stale or modified data.</li>
                </ul>
                <div style={{ padding: "0.75rem", background: "rgba(139, 92, 246, 0.05)", borderLeft: "3px solid var(--purple)", borderRadius: "var(--r-sm)" }}>
                  <strong style={{ color: "var(--text-0)" }}>AI Delta Validation:</strong> When v2 is submitted, the AI automatically compares it against v1. It mathematically analyzes the exact fields changed to verify if the new data actually resolves the original rejection reason. If you try to resubmit without fixing the error, the AI will immediately block Quality approval.
                </div>
              </div>
            </div>
          </section>

        </div>
        
        {/* Footer */}
        <div className="cs-guide-modal-footer" style={{
          padding: "1rem 1.5rem",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-0)",
          display: "flex",
          justifyContent: "flex-end"
        }}>
          <button className="btn btn-primary" onClick={onClose} style={{ padding: "0.5rem 1rem", fontSize: "0.875rem", fontWeight: 600 }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

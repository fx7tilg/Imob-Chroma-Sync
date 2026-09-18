import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { showToast } from "../../components/ui/Toast";
import { MOCK_DECISIONS, RATING_BADGE, STATUS_BADGE, timeAgo } from "../../utils/mockData";

export default function PendingReview() {
  const [decisions] = useState(
    MOCK_DECISIONS.filter((d) => d.status === "submitted" || d.status === "under_review")
  );

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1>Pending Review</h1>
        <p>Decisions awaiting sign-off from Quality or your team.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {decisions.map((d) => (
          <div key={d.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "0.75rem",
                      color: "var(--text-2)"
                    }}
                  >
                    {d.code}
                  </span>
                  <span className={`badge ${STATUS_BADGE[d.status]}`}>{d.status.replace("_", " ")}</span>
                  <span className={`badge ${RATING_BADGE[d.ai_rating]}`}>AI · {d.ai_rating}</span>
                </div>
                <div style={{ color: "var(--text-0)", fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {d.component_name}
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-1)", marginBottom: "0.375rem" }}>
                  {d.business_area} · Colour {d.colour_code} · Material {d.material_reference}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>
                  Currently with <span style={{ color: "var(--text-0)", fontWeight: 500 }}>{d.owner_team}</span> · updated {timeAgo(d.updated_at)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-2)", marginTop: "0.5rem", fontStyle: "italic" }}>
                  {d.ai_reason}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", minWidth: 130 }}>
                <button
                  className="btn btn-accent"
                  onClick={() => showToast("success", `${d.code} approved`)}
                >
                  <CheckCircle2 size={13} /> Approve
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => showToast("error", `${d.code} rejected`)}
                >
                  <XCircle size={13} /> Reject
                </button>
              </div>
            </div>
          </div>
        ))}
        {decisions.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-2)" }}>
            Nothing pending. You're all caught up.
          </div>
        )}
      </div>
    </div>
  );
}

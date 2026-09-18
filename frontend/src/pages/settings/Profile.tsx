import { useAuth } from "../../auth/AuthContext";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_BADGE } from "../../utils/permissions";

export default function Profile() {
  const { profile, role, session } = useAuth();

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1>Profile &amp; Account</h1>
        <p>Manage your personal details, team assignment, and workspace preferences.</p>
      </div>

      <div className="grid2">
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--accent), var(--cyan))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "1.25rem",
                fontWeight: 700
              }}
            >
              {profile?.full_name
                ?.split(" ")
                .map((s) => s[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase() ?? "??"}
            </div>
            <div>
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-0)" }}>
                {profile?.full_name ?? "-"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>
                {session?.user?.email}
              </div>
              <span className={`badge ${ROLE_BADGE[role]}`} style={{ marginTop: "0.375rem" }}>
                {ROLE_LABELS[role]}
              </span>
            </div>
          </div>
          <p style={{ fontSize: "0.8125rem" }}>{ROLE_DESCRIPTIONS[role]}</p>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: "0.75rem" }}>Team Assignment</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <div className="stat-label">Team</div>
              <div style={{ fontSize: "0.9375rem", color: "var(--text-0)", marginTop: "0.25rem" }}>
                {profile?.team ?? "-"}
              </div>
            </div>
            <div>
              <div className="stat-label">Project Lead</div>
              <div style={{ fontSize: "0.9375rem", color: "var(--text-0)", marginTop: "0.25rem" }}>
                {profile?.is_project_lead ? "Yes" : "No"}
              </div>
            </div>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-2)", marginTop: "1rem" }}>
            Team and role are set by your workspace admin. Contact them for changes.
          </p>
        </div>
      </div>
    </div>
  );
}

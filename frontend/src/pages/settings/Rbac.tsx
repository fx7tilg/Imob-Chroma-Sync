import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  Shield,
  Grid3x3,
  Users,
  Mail,
  Copy,
  RotateCw,
  X,
  Plus,
  ChevronDown,
  ChevronUp,
  AlertTriangle
} from "lucide-react";
import PermissionGate from "../../components/auth/PermissionGate";
import { showToast } from "../../components/ui/Toast";
import type { ProfileRole, Team, TeamInvitation } from "../../types/db";
import {
  ROLES,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_BADGE,
  ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  roleFromProfile,
  type RoleKey,
  type RiskLevel
} from "../../utils/permissions";

const RISK_COLOR: Record<RiskLevel, string> = {
  low: "var(--green)",
  medium: "var(--amber)",
  high: "var(--red)",
  critical: "#7f1d1d"
};

type InviteStatus = "pending" | "accepted" | "expired" | "revoked";

// A pending invitation past its expiry is shown as expired; the row itself
// only ever moves pending -> accepted | revoked.
function inviteStatus(i: TeamInvitation): InviteStatus {
  if (i.status === "pending" && new Date(i.expires_at).getTime() <= Date.now()) return "expired";
  return i.status;
}

function inviteRole(i: TeamInvitation): RoleKey {
  if (i.is_project_lead) return "project_admin";
  return `${i.team}_${i.role}` as RoleKey;
}

// A RoleKey is `<team>_<role>`, or project_admin which has no team.
function splitRole(r: RoleKey): { team: Team | null; role: ProfileRole; isLead: boolean } {
  if (r === "project_admin") return { team: null, role: "editor", isLead: true };
  const [team, role] = r.split("_") as [Team, ProfileRole];
  return { team, role, isLead: false };
}

function inviteLink(token: string) {
  return `${window.location.origin}/signup?invite=${token}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const INVITE_BADGE: Record<InviteStatus, string> = {
  pending: "badge-amber",
  accepted: "badge-green",
  expired: "badge-red",
  revoked: "badge-neutral"
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

type Tab = "roles" | "matrix" | "members" | "invites";

const TABS: { key: Tab; label: string; icon: typeof Shield }[] = [
  { key: "roles",   label: "Role Definitions", icon: Shield },
  { key: "matrix",  label: "Permission Matrix", icon: Grid3x3 },
  { key: "members", label: "Team Members", icon: Users },
  { key: "invites", label: "Invitations", icon: Mail }
];

export default function Rbac() {
  const [tab, setTab] = useState<Tab>("roles");

  return (
    <PermissionGate permission="users.view">
      <div>
        <div style={{ marginBottom: "1.5rem" }}>
          <h1>Team &amp; Roles</h1>
          <p>Manage roles, permissions, team members, and invitations.</p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.25rem",
            background: "var(--bg-1)",
            padding: "0.25rem",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
            width: "fit-content",
            marginBottom: "1.25rem"
          }}
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.5rem 1rem",
                  borderRadius: "var(--r-sm)",
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--text-2)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  fontFamily: "inherit",
                  transition: "all var(--duration) var(--ease)"
                }}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="page-enter" key={tab}>
          {tab === "roles" && <RolesTab />}
          {tab === "matrix" && <MatrixTab />}
          {tab === "members" && <MembersTab />}
          {tab === "invites" && <InvitesTab />}
        </div>
      </div>
    </PermissionGate>
  );
}

/* ─── Tab 1: Role Definitions ─── */
function RolesTab() {
  const [expanded, setExpanded] = useState<RoleKey | null>(null);
  const roleKeys = Object.values(ROLES) as RoleKey[];
  
  const [members, setMembers] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("profiles").select("*").then(({ data }) => {
      if (data) setMembers(data);
    });
  }, []);

  return (
    <>
      <div className="grid3">
        {roleKeys.map((r) => {
          const perms = ROLE_PERMISSIONS[r];
          const isOpen = expanded === r;
          const memberCount = members.filter((m) => roleFromProfile(m) === r).length;
          return (
            <div
              key={r}
              className="card"
              style={{ cursor: "pointer", transition: "border-color var(--duration)" }}
              onClick={() => setExpanded(isOpen ? null : r)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                <span className={`badge ${ROLE_BADGE[r]}`}>{ROLE_LABELS[r]}</span>
                {isOpen ? <ChevronUp size={14} style={{ color: "var(--text-2)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-2)" }} />}
              </div>
              <p style={{ fontSize: "0.8125rem", minHeight: "3.25rem" }}>{ROLE_DESCRIPTIONS[r]}</p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6875rem", color: "var(--text-2)", marginTop: "0.75rem" }}>
                <span>{memberCount} members</span>
                <span>{perms.length} / {PERMISSION_CATALOG.length} permissions</span>
              </div>
              <div style={{ height: 4, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden", marginTop: "0.5rem" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${(perms.length / PERMISSION_CATALOG.length) * 100}%`,
                    background: "var(--accent)",
                    transition: "width 400ms var(--ease)"
                  }}
                />
              </div>

              {isOpen && (
                <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)", animation: "fadeIn 200ms var(--ease)" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                    {PERMISSION_CATALOG.filter((p) => perms.includes(p.key)).map((p) => (
                      <span
                        key={p.key}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          padding: "0.1875rem 0.5rem",
                          borderRadius: "var(--r-sm)",
                          fontSize: "0.6875rem",
                          background: "var(--bg-0)",
                          border: "1px solid var(--border)",
                          color: "var(--text-1)"
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: RISK_COLOR[p.riskLevel]
                          }}
                        />
                        {p.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: "1.25rem",
          padding: "0.875rem 1rem",
          background: "var(--accent-muted)",
          border: "1px solid rgba(16, 185, 129, 0.25)",
          borderRadius: "var(--r-md)",
          display: "flex",
          gap: "0.625rem",
          alignItems: "flex-start"
        }}
      >
        <AlertTriangle size={14} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: "0.75rem", color: "var(--text-1)" }}>
          <strong style={{ color: "var(--accent)" }}>Grant-only model:</strong> if a permission is not
          listed on a role card, it is denied. There are no implicit permissions.
        </div>
      </div>
    </>
  );
}

/* ─── Tab 2: Permission Matrix ─── */
function MatrixTab() {
  const roleKeys = Object.values(ROLES) as RoleKey[];
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ minWidth: 200, position: "sticky", left: 0, background: "var(--bg-2)", zIndex: 11 }}>Permission</th>
              <th>Risk</th>
              {roleKeys.map((r) => (
                <th key={r} style={{ textAlign: "center" }}>
                  {ROLE_LABELS[r].replace(" Team", "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_CATALOG.map((p) => (
              <tr key={p.key}>
                <td style={{ color: "var(--text-0)", fontWeight: 500, position: "sticky", left: 0, background: "var(--bg-1)", zIndex: 1 }}>
                  {p.label}
                </td>
                <td>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: RISK_COLOR[p.riskLevel],
                      marginRight: 6
                    }}
                  />
                  <span style={{ fontSize: "0.6875rem", textTransform: "uppercase", color: "var(--text-2)" }}>
                    {p.riskLevel}
                  </span>
                </td>
                {roleKeys.map((r) => {
                  const granted = ROLE_PERMISSIONS[r].includes(p.key);
                  return (
                    <td key={r} style={{ textAlign: "center" }}>
                      {granted ? (
                        <span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Tab 3: Team Members ─── */
function MembersTab() {
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRole, setPendingRole] = useState<{id: string, name: string, oldRole: string, newRole: string} | null>(null);

  const loadMembers = async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    if (data) setMembers(data);
    setLoading(false);
  };

  useEffect(() => {
    loadMembers();
    const channel = supabase.channel("profiles-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadMembers())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => {
    if (!search) return members;
    const q = search.toLowerCase();
    return members.filter((m) => (m.full_name || "").toLowerCase().includes(q));
  }, [search, members]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of members) {
      const role = roleFromProfile(m);
      counts[role] = (counts[role] ?? 0) + 1;
    }
    return counts;
  }, [members]);

  const confirmRoleChange = async () => {
    if (!pendingRole) return;
    const { id: memberId, oldRole, newRole } = pendingRole;
    setPendingRole(null);

    let isLead = false;
    let team: any = null;
    let roleStr = "viewer";
    
    if (newRole === "project_admin") {
      isLead = true;
    } else {
      const parts = newRole.split('_');
      team = parts[0];
      roleStr = parts[1];
    }

    const { error } = await supabase.from("profiles").update({ team, role: roleStr as any, is_project_lead: isLead }).eq("id", memberId);
    
    if (error) {
      showToast("error", "Failed to update role");
      return;
    }

    // Log to audit_log
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("audit_log").insert({
      table_name: "profiles",
      row_id: memberId,
      action: "ROLE_CHANGE",
      changed_by: session?.user?.id || null,
      old_values: { role: oldRole },
      new_values: { role: newRole }
    });

    showToast("success", `Role updated to ${ROLE_LABELS[newRole as RoleKey]}`);
  };

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
        {(Object.values(ROLES) as RoleKey[]).map((r) => (
          <div key={r} className="card" style={{ padding: "0.875rem" }}>
            <span className={`badge ${ROLE_BADGE[r]}`}>{ROLE_LABELS[r]}</span>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-0)", marginTop: "0.375rem" }}>
              {roleCounts[r] ?? 0}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-2)" }}>members</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: "0.875rem" }}>
        <input
          className="input"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 340 }}
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Permissions</th>
              <th>Joined</th>
              <th style={{ width: 200 }}>Change Role</th>
            </tr>
          </thead>
          <tbody>
            {loading && members.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "2rem", color: "var(--text-2)" }}>Loading members...</td>
              </tr>
            )}
            {filtered.map((m) => {
              const currentRole = roleFromProfile(m);
              return (
                <tr key={m.id}>
                  <td>
                    <div style={{ display: "flex", gap: "0.625rem", alignItems: "center" }}>
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "50%",
                          background: "linear-gradient(135deg, var(--accent), var(--cyan))",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          fontSize: "0.6875rem",
                          fontWeight: 700
                        }}
                      >
                        {String(m.full_name || "U").split(" ").map((s: string) => s?.[0] || "").slice(0, 2).join("")}
                      </div>
                      <div>
                        <div style={{ color: "var(--text-0)", fontWeight: 500 }}>{m.full_name || "Unknown User"}</div>
                        <div style={{ fontSize: "0.6875rem", color: "var(--text-2)", fontFamily: "monospace" }}>{m.id?.substring(0, 8)}...</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`badge ${ROLE_BADGE[currentRole as RoleKey]}`}>{ROLE_LABELS[currentRole as RoleKey]}</span></td>
                  <td>{ROLE_PERMISSIONS[currentRole as RoleKey]?.length || 0}</td>
                  <td style={{ color: "var(--text-2)" }}>
                    {m.created_at ? new Date(m.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td>
                    <select
                      className="input"
                      value={currentRole}
                      onChange={(e) => setPendingRole({ id: m.id, name: m.full_name, oldRole: currentRole, newRole: e.target.value })}
                      style={{ padding: "0.375rem 0.5rem", fontSize: "0.75rem" }}
                    >
                      {(Object.values(ROLES) as RoleKey[]).map((r) => (
                         <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pendingRole && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "fadeIn 150ms var(--ease)"
          }}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: 440, padding: "1.5rem", boxShadow: "var(--shadow-lg)" }}
          >
            <h2 style={{ marginBottom: "1rem" }}>Confirm Role Change</h2>
            <p style={{ fontSize: "0.875rem", color: "var(--text-1)", marginBottom: "1.5rem", lineHeight: 1.5 }}>
              Are you sure you want to change the role of <strong>{pendingRole.name}</strong> from{" "}
              <span className={`badge ${ROLE_BADGE[pendingRole.oldRole as RoleKey]}`}>{ROLE_LABELS[pendingRole.oldRole as RoleKey]}</span> to{" "}
              <span className={`badge ${ROLE_BADGE[pendingRole.newRole as RoleKey]}`}>{ROLE_LABELS[pendingRole.newRole as RoleKey]}</span>?
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setPendingRole(null)}>Cancel</button>
              <button className="btn btn-accent" onClick={confirmRoleChange}>Confirm Change</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Tab 4: Invitations ─── */
function InvitesTab() {
  const [invites, setInvites] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleKey>("design_viewer");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<TeamInvitation | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("team_invitations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setLoadError(error.message);
    else {
      setLoadError(null);
      setInvites((data ?? []) as TeamInvitation[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    const count = (s: InviteStatus) => invites.filter((i) => inviteStatus(i) === s).length;
    return {
      total: invites.length,
      pending: count("pending"),
      accepted: count("accepted"),
      expired: count("expired")
    };
  }, [invites]);

  const closeModal = () => {
    setShowModal(false);
    setEmail("");
    setRole("design_viewer");
    setFormError(null);
    setCreated(null);
  };

  const submit = async () => {
    const { team, role: dbRole, isLead } = splitRole(role);
    setBusy(true);
    setFormError(null);
    const { data, error } = await supabase.rpc("create_invitation", {
      p_email: email,
      p_team: team,
      p_role: dbRole,
      p_is_lead: isLead
    });
    setBusy(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setCreated(data as TeamInvitation);
    void load();
  };

  const copyLink = async (token: string) => {
    const ok = await copyText(inviteLink(token));
    showToast(ok ? "success" : "error", ok ? "Invite link copied" : "Could not copy - select the link and copy it manually");
  };

  const resend = async (i: TeamInvitation) => {
    const { data, error } = await supabase.rpc("resend_invitation", { p_id: i.id });
    if (error) {
      showToast("error", error.message);
      return;
    }
    const fresh = data as TeamInvitation;
    const ok = await copyText(inviteLink(fresh.token));
    showToast("success", ok ? `New 7-day link for ${i.email} copied` : `New link issued for ${i.email}`);
    void load();
  };

  const revoke = async (i: TeamInvitation) => {
    const { error } = await supabase.from("team_invitations").update({ status: "revoked" }).eq("id", i.id);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("info", `Invitation for ${i.email} cancelled`);
    void load();
  };

  return (
    <>
      <div className="grid4" style={{ marginBottom: "1.25rem" }}>
        <div className="card"><div className="stat-label">Total</div><div className="stat-value">{stats.total}</div></div>
        <div className="card"><div className="stat-label">Pending</div><div className="stat-value" style={{ color: "var(--amber)" }}>{stats.pending}</div></div>
        <div className="card"><div className="stat-label">Accepted</div><div className="stat-value" style={{ color: "var(--green)" }}>{stats.accepted}</div></div>
        <div className="card"><div className="stat-label">Expired</div><div className="stat-value" style={{ color: "var(--red)" }}>{stats.expired}</div></div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.875rem" }}>
        <button className="btn btn-accent" onClick={() => setShowModal(true)}>
          <Plus size={13} /> Invite Member
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Expires</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ color: "var(--text-2)", textAlign: "center", padding: "1.5rem" }}>Loading invitations…</td></tr>
            )}
            {!loading && loadError && (
              <tr><td colSpan={6} style={{ color: "var(--red)", textAlign: "center", padding: "1.5rem" }}>Could not load invitations: {loadError}</td></tr>
            )}
            {!loading && !loadError && invites.length === 0 && (
              <tr><td colSpan={6} style={{ color: "var(--text-2)", textAlign: "center", padding: "1.5rem" }}>
                No invitations yet. Use “Invite Member” to add someone to the workspace.
              </td></tr>
            )}
            {invites.map((i) => {
              const status = inviteStatus(i);
              const actionable = status === "pending" || status === "expired";
              const r = inviteRole(i);
              return (
                <tr key={i.id}>
                  <td style={{ color: "var(--text-0)" }}>{i.email}</td>
                  <td><span className={`badge ${ROLE_BADGE[r]}`}>{ROLE_LABELS[r]}</span></td>
                  <td><span className={`badge ${INVITE_BADGE[status]}`}>{status}</span></td>
                  <td style={{ color: "var(--text-2)" }}>{timeAgo(i.created_at)}</td>
                  <td style={{ color: "var(--text-2)" }}>
                    {new Date(i.expires_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </td>
                  <td>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.25rem" }}>
                      {status === "pending" && (
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "0.375rem" }}
                          title="Copy invite link"
                          onClick={() => void copyLink(i.token)}
                        >
                          <Copy size={13} />
                        </button>
                      )}
                      {actionable && (
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "0.375rem" }}
                          title="Issue a fresh 7-day link"
                          onClick={() => void resend(i)}
                        >
                          <RotateCw size={13} />
                        </button>
                      )}
                      {actionable && (
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "0.375rem" }}
                          title="Cancel invitation"
                          onClick={() => void revoke(i)}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "fadeIn 150ms var(--ease)"
          }}
          onClick={closeModal}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: 440, padding: "1.5rem", boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {created ? (
              <>
                <h2 style={{ marginBottom: "0.5rem" }}>Invitation created</h2>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-2)", marginBottom: "0.875rem" }}>
                  Send this link to <strong style={{ color: "var(--text-0)" }}>{created.email}</strong>. It signs them up as{" "}
                  <strong style={{ color: "var(--text-0)" }}>{ROLE_LABELS[inviteRole(created)]}</strong> and works once, for 7 days.
                </p>
                <input
                  className="input"
                  readOnly
                  value={inviteLink(created.token)}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                />
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                  <a
                    className="btn btn-ghost"
                    href={`mailto:${created.email}?subject=${encodeURIComponent("You're invited to Chroma Sync")}&body=${encodeURIComponent(
                      `You have been invited to Chroma Sync as ${ROLE_LABELS[inviteRole(created)]}.\n\nCreate your account here (link valid for 7 days):\n${inviteLink(created.token)}`
                    )}`}
                  >
                    <Mail size={13} /> Open in email
                  </a>
                  <button className="btn btn-accent" onClick={() => void copyLink(created.token)}>
                    <Copy size={13} /> Copy link
                  </button>
                  <button className="btn btn-ghost" onClick={closeModal}>Done</button>
                </div>
              </>
            ) : (
              <>
            <h2 style={{ marginBottom: "1rem" }}>Invite Member</h2>
            <div style={{ marginBottom: "0.875rem" }}>
              <label style={{ fontSize: "0.75rem", color: "var(--text-2)", display: "block", marginBottom: "0.25rem" }}>
                Email
              </label>
              <input
                className="input"
                type="email"
                placeholder="colleague@vw.de"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: "0.875rem" }}>
              <label style={{ fontSize: "0.75rem", color: "var(--text-2)", display: "block", marginBottom: "0.25rem" }}>
                Role
              </label>
              <select
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as RoleKey)}
              >
                {(Object.values(ROLES) as RoleKey[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]} ({ROLE_PERMISSIONS[r].length} permissions)
                  </option>
                ))}
              </select>
            </div>
            {role === "project_admin" && (
              <div
                style={{
                  padding: "0.625rem 0.75rem",
                  background: "var(--red-muted)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  borderRadius: "var(--r-sm)",
                  fontSize: "0.75rem",
                  color: "var(--red)",
                  marginBottom: "0.875rem",
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "flex-start"
                }}
              >
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Project Admin grants full workspace access. Use with care.</span>
              </div>
            )}
            {formError && (
              <div style={{ fontSize: "0.75rem", color: "var(--red)", marginBottom: "0.5rem" }}>{formError}</div>
            )}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn btn-accent" onClick={() => void submit()} disabled={!email || busy}>
                {busy ? "Creating…" : "Create Invite"}
              </button>
            </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

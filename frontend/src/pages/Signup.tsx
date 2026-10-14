import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../lib/supabase";
import type { InvitationPreview, Team } from "../types/db";
import { ROLE_LABELS, type RoleKey } from "../utils/permissions";
import LogoMark from "../components/LogoMark";
import "../landing.css";

const roleOptions: { value: Team | "project_lead"; label: string }[] = [
  { value: "design", label: "Design" },
  { value: "engineering", label: "Engineering" },
  { value: "procurement", label: "Procurement" },
  { value: "quality", label: "Quality" },
  { value: "project_lead", label: "Project Lead / Group Admin" }
];

export default function Signup() {
  const { signUp } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const inviteToken = params.get("invite");
  const [invite, setInvite] = useState<InvitationPreview | null>(null);
  const [inviteState, setInviteState] = useState<"none" | "loading" | "valid" | "invalid">(
    inviteToken ? "loading" : "none"
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Team | "project_lead">("design");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    supabase.rpc("invitation_for_token", { p_token: inviteToken }).then(({ data, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError || !data) {
        setInviteState("invalid");
        return;
      }
      setInvite(data);
      setEmail(data.email);
      setInviteState("valid");
    });
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const invitedRole: RoleKey | null = invite
    ? invite.is_project_lead
      ? "project_admin"
      : (`${invite.team}_${invite.role}` as RoleKey)
    : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (inviteToken && invite) {
        await signUp(email, password, fullName, invite.team, invite.is_project_lead, inviteToken);
      } else {
        const isLead = role === "project_lead";
        await signUp(email, password, fullName, isLead ? null : (role as Team), isLead);
      }
      nav("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (inviteState === "loading" || inviteState === "invalid") {
    return (
      <div className="cs-scope cs-auth-shell">
        <div className="cs-auth-card">
          <Link to="/" className="cs-auth-brand">
            <LogoMark />
            CHROMA SYNC
          </Link>
          {inviteState === "loading" ? (
            <p className="cs-lead">Checking your invitation…</p>
          ) : (
            <>
              <h1>Invitation not valid.</h1>
              <p className="cs-lead">
                This invitation link has expired, was cancelled, or has already been used. Ask your
                project administrator to send a new one.
              </p>
              <div className="cs-auth-foot">
                Already have access? <Link to="/login">Sign in</Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="cs-scope cs-auth-shell">
      <div className="cs-auth-card">
        <Link to="/" className="cs-auth-brand">
          <LogoMark />
          CHROMA SYNC
        </Link>
        <h1>{invitedRole ? "Accept your invitation." : "Request access."}</h1>
        <p className="cs-lead">
          {invitedRole
            ? `You have been invited to Chroma Sync as ${ROLE_LABELS[invitedRole]}. Choose a password to create your account.`
            : "Create your account. Your brand and programme access are assigned by your Group administrator once the request is approved."}
        </p>
        <form onSubmit={submit}>
          <div className="cs-field">
            <label>Full name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="cs-field">
            <label>Work email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              readOnly={!!invite}
              required
            />
          </div>
          <div className="cs-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {invitedRole ? (
            <div className="cs-field">
              <label>Role</label>
              <input value={ROLE_LABELS[invitedRole]} readOnly />
            </div>
          ) : (
            <div className="cs-field">
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as Team | "project_lead")}>
                {roleOptions.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}
          {error && <div className="cs-auth-error">{error}</div>}
          <button type="submit" className="cs-btn primary block" disabled={busy}>
            {busy ? "Creating…" : "Create workspace profile →"}
          </button>
        </form>
        <div className="cs-auth-foot">
          Already have access? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

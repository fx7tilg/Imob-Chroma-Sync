import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { Team } from "../types/db";
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
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Team | "project_lead">("design");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const isLead = role === "project_lead";
      await signUp(email, password, fullName, isLead ? null : (role as Team), isLead);
      nav("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cs-scope cs-auth-shell">
      <div className="cs-auth-card">
        <Link to="/" className="cs-auth-brand">
          <LogoMark />
          CHROMA SYNC
        </Link>
        <h1>Request access.</h1>
        <p className="cs-lead">
          Create your account. Your brand and programme access are assigned by
          your Group administrator once the request is approved.
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
          <div className="cs-field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Team | "project_lead")}>
              {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
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

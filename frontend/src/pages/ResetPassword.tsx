import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import LogoMark from "../components/LogoMark";
import "../landing.css";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cs-scope cs-auth-shell">
      <div className="cs-auth-card">
        <div className="cs-auth-brand">
          <LogoMark />
          CHROMA SYNC
        </div>
        <h1>Set a new password.</h1>
        <p className="cs-lead">Enter and confirm your new password below.</p>
        {done ? (
          <div className="cs-auth-error" style={{ background: "rgba(0,239,212,0.12)", color: "#a7fbf0" }}>
            Password updated. Redirecting to sign in…
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="cs-field">
              <label>New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="cs-field">
              <label>Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {error && <div className="cs-auth-error">{error}</div>}
            <button type="submit" className="cs-btn primary block" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import LogoMark from "../components/LogoMark";
import "../landing.css";

export default function Login() {
  const { signIn, signInWithPKI, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPKI, setShowPKI] = useState(false);
  const [pkiPin, setPkiPin] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);

  // Auto-open the PKI prompt if the user leaves email/password empty for 5s.
  useEffect(() => {
    if (showPKI || email || password) return;
    const timer = setTimeout(() => setShowPKI(true), 5000);
    return () => clearTimeout(timer);
  }, [showPKI, email, password]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitPKI(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithPKI(pkiPin);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setShowPKI(false);
      setPkiPin("");
    }
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setForgotMsg(null);
    try {
      await resetPassword(forgotEmail);
      setForgotMsg("If an account exists for that email, a password reset link has been sent.");
    } catch (err) {
      setForgotMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cs-scope cs-auth-shell">
      <div className="cs-auth-card">
        <svg className="cs-auth-border" width="100%" height="100%" aria-hidden="true">
          <defs>
            <linearGradient id="csSparkA" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#5b8def" stopOpacity="0" />
              <stop offset="60%" stopColor="#6fa6ff" />
              <stop offset="100%" stopColor="#a8f0e3" />
            </linearGradient>
          </defs>
          <rect
            className="cs-auth-border-run"
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx="18"
            ry="18"
            pathLength={100}
          />
        </svg>
        <Link to="/" className="cs-auth-brand">
          <LogoMark />
          CHROMA SYNC
        </Link>
        <h1>Welcome back.</h1>
        <p className="cs-lead">Sign in to your Group workspace.</p>
        <form onSubmit={submit}>
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
              required
            />
          </div>
          <div className="cs-auth-forgot">
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); setForgotEmail(email); setForgotMsg(null); setShowForgot(true); }}
            >
              Forgot password?
            </a>
          </div>
          {error && <div className="cs-auth-error">{error}</div>}
          <button type="submit" className="cs-btn primary block" disabled={busy}>
            {busy ? "Signing in…" : "Sign In →"}
          </button>
          <button
            type="button"
            className="cs-btn secondary block"
            onClick={() => setShowPKI(true)}
            disabled={busy}
          >
            Sign in with PKI card (IdP)
          </button>
        </form>

      </div>

      {showPKI && (
        <div className="cs-modal">
          <div className="cs-modal-backdrop" onClick={() => setShowPKI(false)} />
          <div className="cs-modal-card">
            <h2>PKI Card Login</h2>
            <p>Insert your PKI card and enter the card PIN to authenticate via the IdP.</p>
            <form onSubmit={submitPKI}>
              <div className="cs-field">
                <label>Card PIN</label>
                <input
                  type="password"
                  value={pkiPin}
                  onChange={(e) => setPkiPin(e.target.value)}
                  placeholder="Card PIN"
                  required
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="cs-btn primary" type="submit" disabled={busy}>
                  {busy ? "Authenticating…" : "Use PKI card"}
                </button>
                <button className="cs-btn" type="button" onClick={() => setShowPKI(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForgot && (
        <div className="cs-modal">
          <div className="cs-modal-backdrop" onClick={() => setShowForgot(false)} />
          <div className="cs-modal-card">
            <h2>Reset password</h2>
            <p>Enter your work email. If an account exists, we'll send a secure link to set a new password.</p>
            <form onSubmit={submitForgot}>
              <div className="cs-field">
                <label>Work email</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoFocus
                />
              </div>
              {forgotMsg && <div className="cs-auth-error">{forgotMsg}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="cs-btn primary" type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Send reset link"}
                </button>
                <button className="cs-btn" type="button" onClick={() => setShowForgot(false)}>
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

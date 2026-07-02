import { useState } from "react";
import { useAuth } from "./AuthContext";
import { api } from "../api";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("login"); // login | forgot
  const [info, setInfo] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try { await login(username, password, rememberMe); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function forgot(e) {
    e.preventDefault();
    setError(""); setInfo(""); setBusy(true);
    try {
      const r = await api.auth.forgotPassword(username);
      setInfo(r.resetToken ? `Reset token (demo): ${r.resetToken}` : "If the account exists, a reset link was sent.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">PE</div>
        <h1>Project Estimator Pro</h1>
        <p className="login-sub">{mode === "login" ? "Sign in to your account" : "Reset your password"}</p>

        {error && <div className="error-banner" style={{ marginBottom: "0.75rem" }}>{error}</div>}
        {info && <div className="login-info">{info}</div>}

        {mode === "login" ? (
          <form onSubmit={submit} className="login-form">
            <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
            <label className="login-remember"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> Remember me</label>
            <button type="submit" className="primary-button login-btn" disabled={busy}>{busy ? "Signing in…" : "Sign In"}</button>
            <button type="button" className="link-button" onClick={() => { setMode("forgot"); setError(""); }}>Forgot password?</button>
          </form>
        ) : (
          <form onSubmit={forgot} className="login-form">
            <label>Username or Email<input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus /></label>
            <button type="submit" className="primary-button login-btn" disabled={busy}>{busy ? "Submitting…" : "Request Reset"}</button>
            <button type="button" className="link-button" onClick={() => { setMode("login"); setError(""); setInfo(""); }}>Back to sign in</button>
          </form>
        )}

        <p className="login-hint">Default admin: <strong>admin</strong> / <strong>admin123</strong></p>
      </div>
    </div>
  );
}

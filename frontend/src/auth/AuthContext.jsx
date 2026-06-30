import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api, setAuthToken, getAuthToken, setUnauthorizedHandler } from "../api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const INACTIVITY_MS = 30 * 60_000; // auto-logout after 30 min idle

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const idleTimer = useRef(null);

  const logout = useCallback(async (silent) => {
    try { if (!silent) await api.auth.logout(); } catch { /* ignore */ }
    setAuthToken(null);
    setUser(null);
  }, []);

  // Restore session from a stored token.
  useEffect(() => {
    setUnauthorizedHandler(() => { setAuthToken(null); setUser(null); });
    if (getAuthToken()) {
      api.auth.me().then((d) => setUser(d.user)).catch(() => setAuthToken(null)).finally(() => setLoading(false));
    } else setLoading(false);
  }, []);

  // Inactivity auto-logout.
  useEffect(() => {
    if (!user) return;
    function reset() {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => logout(true), INACTIVITY_MS);
    }
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => { events.forEach((e) => window.removeEventListener(e, reset)); if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [user, logout]);

  async function login(username, password, rememberMe) {
    const d = await api.auth.login({ username, password, rememberMe });
    setAuthToken(d.token);
    setUser(d.user);
    return d.user;
  }

  function can(module, action) {
    if (!user) return false;
    const perms = user.permissions || {};
    return Array.isArray(perms[module]) && perms[module].includes(action);
  }

  const isAdmin = user && (user.role === "Administrator" || can("Administration", "edit"));

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can, isAdmin, refresh: () => api.auth.me().then((d) => setUser(d.user)) }}>
      {children}
    </AuthContext.Provider>
  );
}

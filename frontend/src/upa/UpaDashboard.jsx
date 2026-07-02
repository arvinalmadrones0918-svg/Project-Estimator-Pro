import { useEffect, useState } from "react";
import { api } from "../api";
import Spinner from "../components/Spinner";

// Rate Analysis dashboard: totals, favorites, recently modified, most used, and
// category distribution. Read-only snapshot of the library.
export default function UpaDashboard({ onOpen, setError }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.upa.stats()
      .then(setStats)
      .catch((e) => setError?.(e.message))
      .finally(() => setLoading(false));
  }, [setError]);

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (!stats) return <p className="empty-state">No dashboard data.</p>;

  const maxCat = Math.max(1, ...stats.byCategory.map((c) => c.count));

  return (
    <div className="upa-dashboard">
      <div className="upa-dash-cards">
        <div className="upa-dash-card"><span>Total Rate Analyses</span><strong>{stats.total}</strong></div>
        <div className="upa-dash-card"><span>Favorites</span><strong>{stats.favorites.length}</strong></div>
        <div className="upa-dash-card"><span>Archived</span><strong>{stats.archived}</strong></div>
        <div className="upa-dash-card"><span>Categories</span><strong>{stats.byCategory.length}</strong></div>
      </div>

      <div className="upa-dash-grid">
        <section className="upa-dash-panel">
          <h4>Recently Modified</h4>
          {stats.recent.length === 0 ? <p className="empty-state-small">None yet.</p> : (
            <ul className="upa-dash-list">
              {stats.recent.map((u) => (
                <li key={u.id} onClick={() => onOpen(u.id)}>
                  <span className="upa-dash-code">{u.code || "—"}</span>
                  <span className="upa-dash-desc">{u.description}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="upa-dash-panel">
          <h4>Most Used</h4>
          {stats.mostUsed.length === 0 ? <p className="empty-state-small">Not referenced in any estimate yet.</p> : (
            <ul className="upa-dash-list">
              {stats.mostUsed.map((u) => (
                <li key={u.id} onClick={() => onOpen(u.id)}>
                  <span className="upa-dash-code">{u.code || "—"}</span>
                  <span className="upa-dash-desc">{u.description}</span>
                  <span className="upa-dash-badge">{u.uses}×</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="upa-dash-panel">
          <h4>Favorites</h4>
          {stats.favorites.length === 0 ? <p className="empty-state-small">No favorites yet.</p> : (
            <ul className="upa-dash-list">
              {stats.favorites.map((u) => (
                <li key={u.id} onClick={() => onOpen(u.id)}>
                  <span className="upa-dash-code">★ {u.code || "—"}</span>
                  <span className="upa-dash-desc">{u.description}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="upa-dash-panel">
          <h4>Category Distribution</h4>
          {stats.byCategory.length === 0 ? <p className="empty-state-small">No categories.</p> : (
            <ul className="upa-dash-bars">
              {stats.byCategory.map((c) => (
                <li key={c.category}>
                  <span className="upa-dash-bar-label">{c.category}</span>
                  <span className="upa-dash-bar-track">
                    <span className="upa-dash-bar-fill" style={{ width: `${(c.count / maxCat) * 100}%` }} />
                  </span>
                  <span className="upa-dash-bar-count">{c.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

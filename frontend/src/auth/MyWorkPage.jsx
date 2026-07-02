import { useEffect, useState } from "react";
import { api } from "../api";
import Spinner from "../components/Spinner";

// "My Work" dashboard: pending reviews/approvals, recent projects, favorites,
// recent activity.
export default function MyWorkPage({ onOpenProject }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.enterprise.dashboard().then(setData).catch(() => {}); }, []);
  if (!data) return <Spinner label="Loading your work…" />;

  const Card = ({ title, items, render, empty }) => (
    <div className="mywork-card">
      <h3>{title}</h3>
      {items.length === 0 ? <p className="empty-state-small">{empty}</p> : <ul className="mywork-list">{items.map(render)}</ul>}
    </div>
  );

  return (
    <div className="mywork-page">
      <div className="catalog-toolbar"><h2 className="catalog-title">My Work</h2></div>
      <div className="mywork-grid">
        <Card title={`Pending Reviews (${data.pendingReviews.length})`} items={data.pendingReviews} empty="Nothing awaiting review."
          render={(p) => <li key={p.id}><button className="link-button" onClick={() => onOpenProject(p.id)}>{p.name}</button> <span className="status-badge">{p.workflowStatus}</span></li>} />
        <Card title={`Pending Approvals (${data.pendingApprovals.length})`} items={data.pendingApprovals} empty="No approvals waiting on you."
          render={(p) => <li key={p.id}><button className="link-button" onClick={() => onOpenProject(p.id)}>{p.name}</button> <span className="muted">level {p.approvalLevel}</span></li>} />
        <Card title="Favorite Projects" items={data.favorites} empty="No favorites yet."
          render={(p) => <li key={p.id}><button className="link-button" onClick={() => onOpenProject(p.id)}>★ {p.name}</button></li>} />
        <Card title="Recent Projects" items={data.recentProjects} empty="No recent projects."
          render={(p) => <li key={p.id}><button className="link-button" onClick={() => onOpenProject(p.id)}>{p.name}</button> <span className="status-badge">{p.workflowStatus}</span></li>} />
        <Card title="Recent Activity" items={data.recentActivity} empty="No recent activity."
          render={(a) => <li key={a.id}><span className="mywork-action">{a.action}</span> {a.entityType} {a.entityId ? `#${a.entityId}` : ""} <span className="notif-time">{new Date(a.createdAt + "Z").toLocaleString()}</span></li>} />
      </div>
    </div>
  );
}

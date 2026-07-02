import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { money, formatDate } from "../utils";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";

const EMPTY_FORM = { name: "", projectNumber: "", client: "", location: "", estimator: "", currency: "USD" };

export default function Dashboard({ onOpenProject }) {
  const [projects, setProjects] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmAction, setConfirmAction] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const searchRef = useRef(null);

  // "/" focuses search, mirroring the common list-view shortcut.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function load() {
    setLoading(true);
    const params = statusFilter === "all" ? { q: search } : { q: search, status: statusFilter };
    api.projects
      .list(params)
      .then(setProjects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [statusFilter]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    api.projects.list({ status: "active" }).then((data) => setRecent(data.slice(0, 5))).catch(() => {});
  }, [projects]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      const created = await api.projects.create(form);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      load();
      onOpenProject(created.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDuplicate(project) {
    setBusyId(project.id);
    try {
      await api.projects.duplicate(project.id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchiveToggle(project) {
    setBusyId(project.id);
    try {
      if (project.status === "archived") {
        await api.projects.restore(project.id);
      } else {
        await api.projects.archive(project.id);
      }
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(project) {
    setBusyId(project.id);
    try {
      await api.projects.remove(project.id);
      setConfirmAction(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page dashboard">
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <div className="dashboard-toolbar">
        <input
          ref={searchRef}
          className="search-input"
          placeholder="Search projects by name, number, or client… (press / to focus)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
        <button className="primary-button" onClick={() => setShowCreate(true)}>
          + New Project
        </button>
      </div>

      {recent.length > 0 && !search && statusFilter === "active" && (
        <section className="recent-projects">
          <h3>Recent Projects</h3>
          <div className="recent-list">
            {recent.map((p) => (
              <button key={p.id} className="recent-card" onClick={() => onOpenProject(p.id)}>
                <div className="recent-name">{p.name}</div>
                <div className="recent-meta">{formatDate(p.updatedAt)}</div>
                <div className="recent-cost">{money(p.totalEstimatedCost)}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <Spinner label="Loading projects…" />
      ) : projects.length === 0 ? (
        <p className="empty-state">No projects found. Create your first project to get started.</p>
      ) : (
        <table className="project-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Client</th>
              <th>Status</th>
              <th>Last Modified</th>
              <th>Total Estimated Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className={busyId === p.id ? "row-busy" : ""}>
                <td>
                  <button className="link-button project-open" onClick={() => onOpenProject(p.id)}>
                    {p.name}
                  </button>
                  {p.projectNumber && <span className="project-number"> #{p.projectNumber}</span>}
                </td>
                <td>{p.client || "—"}</td>
                <td>
                  <span className={`status-badge status-${p.status}`}>{p.status}</span>
                </td>
                <td>{formatDate(p.updatedAt)}</td>
                <td>{money(p.totalEstimatedCost)}</td>
                <td className="project-actions">
                  <button className="link-button" onClick={() => onOpenProject(p.id)}>
                    Open
                  </button>
                  <button className="link-button" disabled={busyId === p.id} onClick={() => handleDuplicate(p)}>
                    Duplicate
                  </button>
                  <button className="link-button" disabled={busyId === p.id} onClick={() => handleArchiveToggle(p)}>
                    {p.status === "archived" ? "Restore" : "Archive"}
                  </button>
                  <button
                    className="link-button danger"
                    disabled={busyId === p.id}
                    onClick={() => setConfirmAction(p)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <Modal title="Create Project" onClose={() => setShowCreate(false)}>
          <form className="stacked-form" onSubmit={handleCreate}>
            <label>
              Project Name *
              <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Project Number
              <input value={form.projectNumber} onChange={(e) => setForm({ ...form, projectNumber: e.target.value })} />
            </label>
            <label>
              Client
              <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
            </label>
            <label>
              Location
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </label>
            <label>
              Estimator
              <input value={form.estimator} onChange={(e) => setForm({ ...form, estimator: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button">
                Create Project
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmAction && (
        <ConfirmDialog
          title="Delete Project"
          message={`Delete "${confirmAction.name}"? This can't be undone from the UI (the record is soft-deleted and hidden from all views).`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => handleDelete(confirmAction)}
        />
      )}
    </div>
  );
}

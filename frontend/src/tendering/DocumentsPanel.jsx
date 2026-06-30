import { useEffect, useState } from "react";
import { api } from "../api";
import Modal from "../components/Modal";

const ENTITY_TYPES = ["project", "tender", "estimate", "assembly", "material", "supplier", "upa"];

// Document control: attach documents to any entity, with version history.
// (File contents aren't stored — this registers document metadata + versions,
// the accepted-types gate, and a URL/reference per version.)
export default function DocumentsPanel({ setError }) {
  const [entityType, setEntityType] = useState("tender");
  const [entityId, setEntityId] = useState("");
  const [docs, setDocs] = useState([]);
  const [accepted, setAccepted] = useState([]);
  const [adding, setAdding] = useState(false);
  const [versioning, setVersioning] = useState(null);

  function load() {
    api.documents.list({ entityType, entityId: entityId || undefined }).then(setDocs).catch((e) => setError(e.message));
  }
  useEffect(load, [entityType, entityId]);
  useEffect(() => { api.documents.acceptedTypes().then((d) => setAccepted(d.types)).catch(() => {}); }, []);

  return (
    <div className="documents-panel">
      <div className="documents-filter">
        <label>Entity Type
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>Entity ID
          <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="optional" />
        </label>
        <button className="primary-button" onClick={() => setAdding(true)}>+ Attach Document</button>
      </div>
      <p className="import-hint">Accepted: {accepted.join(", ")}</p>

      {docs.length === 0 ? <p className="empty-state-small">No documents.</p> : (
        <table className="catalog-grid">
          <thead><tr><th>Name</th><th>Type</th><th>Entity</th><th>Version</th><th>History</th><th>Actions</th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{d.fileType || "—"}</td>
                <td>{d.entityType} #{d.entityId}</td>
                <td>v{d.currentVersion}</td>
                <td>{(d.versions || []).map((v) => `v${v.version}`).join(", ")}</td>
                <td className="catalog-row-actions">
                  <button className="link-button" onClick={() => setVersioning(d)}>+ Version</button>
                  <button className="link-button danger" onClick={() => api.documents.remove(d.id).then(load)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding && (
        <DocForm title="Attach Document" accepted={accepted} fixedEntity={{ entityType, entityId }}
          onSave={async (form) => { await api.documents.create(form); setAdding(false); load(); }}
          onClose={() => setAdding(false)} setError={setError} />
      )}
      {versioning && (
        <DocForm title={`New Version — ${versioning.name}`} accepted={accepted} versionOnly
          onSave={async (form) => { await api.documents.addVersion(versioning.id, form); setVersioning(null); load(); }}
          onClose={() => setVersioning(null)} setError={setError} />
      )}
    </div>
  );
}

function DocForm({ title, accepted, fixedEntity, versionOnly, onSave, onClose, setError }) {
  const [form, setForm] = useState({ name: "", fileType: "pdf", fileName: "", url: "", note: "", description: "" });
  async function submit(e) {
    e.preventDefault();
    try {
      const payload = versionOnly
        ? { fileType: form.fileType, fileName: form.fileName, url: form.url, note: form.note }
        : { ...fixedEntity, entityId: Number(fixedEntity.entityId), name: form.name, fileType: form.fileType, fileName: form.fileName, url: form.url, description: form.description };
      if (!versionOnly && (!payload.entityId || !payload.name)) { setError("Entity ID and name are required."); return; }
      await onSave(payload);
    } catch (err) { setError(err.message); }
  }
  return (
    <Modal title={title} onClose={onClose} width={520}>
      <form className="catalog-form-grid" onSubmit={submit}>
        {!versionOnly && <label className="span-2">Document Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></label>}
        <label>File Type
          <select value={form.fileType} onChange={(e) => setForm({ ...form, fileType: e.target.value })}>
            {accepted.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>File Name<input value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} /></label>
        <label className="span-2">URL / Reference<input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
        {versionOnly && <label className="span-2">Note<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button">Save</button>
        </div>
      </form>
    </Modal>
  );
}

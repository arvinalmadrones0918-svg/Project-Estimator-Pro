import { useEffect, useState } from "react";
import { api } from "../api";

// Phase 10 (Enterprise) — Organization management: company profile plus simple
// collections (branches, departments, business units, currencies, tax).
const COLLECTIONS = [
  { kind: "branches", label: "Branches", loader: () => api.organization.branches(),
    fields: [["name", "Name"], ["code", "Code"], ["city", "City"], ["country", "Country"], ["manager", "Manager"]] },
  { kind: "departments", label: "Departments", loader: () => api.organization.departments(),
    fields: [["name", "Name"], ["code", "Code"], ["head", "Head"]] },
  { kind: "business-units", label: "Business Units", loader: () => api.organization.businessUnits(),
    fields: [["name", "Name"], ["code", "Code"], ["manager", "Manager"]] },
  { kind: "currencies", label: "Currencies", loader: () => api.organization.currencies(),
    fields: [["code", "Code"], ["name", "Name"], ["symbol", "Symbol"], ["exchangeRate", "Rate", "number"]] },
  { kind: "tax-settings", label: "Tax Settings", loader: () => api.organization.taxSettings(),
    fields: [["name", "Name"], ["taxType", "Type"], ["ratePct", "Rate %", "number"]] },
];

const COMPANY_FIELDS = [
  ["name", "Company Name"], ["legalName", "Legal Name"], ["registrationNo", "Registration No."],
  ["taxId", "Tax ID"], ["address", "Address"], ["city", "City"], ["country", "Country"],
  ["phone", "Phone"], ["email", "Email"], ["website", "Website"], ["baseCurrency", "Base Currency"],
];

export default function OrganizationPanel({ setError }) {
  const [sub, setSub] = useState("company");
  return (
    <div className="org-panel">
      <div className="org-subtabs">
        <button className={sub === "company" ? "active" : ""} onClick={() => setSub("company")}>Company Profile</button>
        {COLLECTIONS.map((c) => <button key={c.kind} className={sub === c.kind ? "active" : ""} onClick={() => setSub(c.kind)}>{c.label}</button>)}
      </div>
      {sub === "company" ? <CompanyForm setError={setError} /> : <CollectionEditor def={COLLECTIONS.find((c) => c.kind === sub)} setError={setError} />}
    </div>
  );
}

function CompanyForm({ setError }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.organization.company().then(setForm).catch((e) => setError(e.message)); }, []);
  if (!form) return <p className="empty-state">Loading company profile…</p>;
  async function save() {
    try { const r = await api.organization.saveCompany(form); setForm(r); setSaved(true); setTimeout(() => setSaved(false), 1500); }
    catch (e) { setError(e.message); }
  }
  return (
    <div className="org-company-form">
      {COMPANY_FIELDS.map(([key, label]) => (
        <label key={key}>{label}<input value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>
      ))}
      <div className="org-actions">
        <button className="primary-button" onClick={save}>Save Company Profile</button>
        {saved && <span className="org-saved">✓ Saved</span>}
      </div>
    </div>
  );
}

function CollectionEditor({ def, setError }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({});
  function load() { def.loader().then(setRows).catch((e) => setError(e.message)); }
  useEffect(() => { setForm({}); load(); }, [def.kind]);

  async function add() {
    const required = def.fields[0][0];
    if (!form[required]) { setError(`${def.fields[0][1]} is required`); return; }
    try { await api.organization.create(def.kind, form); setForm({}); load(); }
    catch (e) { setError(e.message); }
  }
  async function remove(id) { try { await api.organization.remove(def.kind, id); load(); } catch (e) { setError(e.message); } }

  return (
    <div>
      <div className="cc-form-row">
        {def.fields.map(([key, label, type]) => (
          <input key={key} type={type || "text"} placeholder={label} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: type === "number" ? Number(e.target.value) : e.target.value })} />
        ))}
        <button className="primary-button" onClick={add}>+ Add</button>
      </div>
      <table className="proc-table">
        <thead><tr>{def.fields.map(([, label]) => <th key={label}>{label}</th>)}<th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {def.fields.map(([key]) => <td key={key}>{String(r[key] ?? "—")}</td>)}
              <td><button className="link-button danger" onClick={() => remove(r.id)}>Delete</button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={def.fields.length + 1} className="empty-state">None yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

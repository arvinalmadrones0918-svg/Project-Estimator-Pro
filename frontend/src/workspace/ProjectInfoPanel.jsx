import { useState } from "react";
import { api } from "../api";
import SaveIndicator from "./SaveIndicator";
import { SUPPORTED_CURRENCIES, setActiveCurrency } from "../utils";

const FIELDS = [
  ["name", "Project Name"],
  ["projectNumber", "Project Number"],
  ["client", "Client"],
  ["owner", "Owner"],
  ["consultant", "Consultant"],
  ["location", "Location"],
  ["estimator", "Estimator"],
  ["revision", "Revision"],
  ["date", "Date"],
  ["currency", "Currency"],
];

export default function ProjectInfoPanel({ project, onSaved, setError }) {
  const [form, setForm] = useState(project);
  const [saveState, setSaveState] = useState(null);

  async function handleBlur() {
    setSaveState("saving");
    try {
      const updated = await api.projects.update(project.id, form);
      setSaveState("saved");
      onSaved(updated);
    } catch (err) {
      setError(err.message);
      setSaveState(null);
    }
  }

  return (
    <div className="project-info-panel">
      <h2>
        Project Information <SaveIndicator state={saveState} />
      </h2>
      <div className="project-info-grid">
        {FIELDS.map(([key, label]) =>
          key === "currency" ? (
            <label key={key}>
              {label}
              <select
                value={form[key] || "USD"}
                onChange={(e) => {
                  const value = e.target.value;
                  setSaveState("dirty");
                  setForm({ ...form, currency: value });
                  setActiveCurrency(value); // reflect immediately across the workspace
                }}
                onBlur={handleBlur}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.label} ({c.symbol})</option>
                ))}
              </select>
            </label>
          ) : (
            <label key={key}>
              {label}
              <input
                value={form[key] || ""}
                onChange={(e) => {
                  setSaveState("dirty");
                  setForm({ ...form, [key]: e.target.value });
                }}
                onBlur={handleBlur}
              />
            </label>
          )
        )}
      </div>
    </div>
  );
}

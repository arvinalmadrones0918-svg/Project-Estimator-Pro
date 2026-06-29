import { useEffect, useState } from "react";
import { api } from "./api";

export default function LaborPage() {
  const [specs, setSpecs] = useState([]);
  const [form, setForm] = useState({ name: "", hourlyRate: "" });
  const [error, setError] = useState("");

  function load() {
    api.laborSpecializations.list().then(setSpecs).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.name || form.hourlyRate === "") return;
    try {
      await api.laborSpecializations.create({ ...form, hourlyRate: Number(form.hourlyRate) });
      setForm({ name: "", hourlyRate: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRateChange(spec, value) {
    const hourlyRate = Number(value);
    if (Number.isNaN(hourlyRate)) return;
    setSpecs((prev) => prev.map((s) => (s.id === spec.id ? { ...s, hourlyRate } : s)));
    try {
      await api.laborSpecializations.update(spec.id, { hourlyRate });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await api.laborSpecializations.remove(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h2>Labor Specializations</h2>
      {error && <p className="error">{error}</p>}

      <form className="inline-form" onSubmit={handleAdd}>
        <input placeholder="Specialization" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input
          placeholder="Hourly rate"
          type="number"
          step="0.01"
          value={form.hourlyRate}
          onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
        />
        <button type="submit">Add Specialization</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Specialization</th>
            <th>Hourly Rate ($)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {specs.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={s.hourlyRate}
                  onChange={(e) => handleRateChange(s, e.target.value)}
                  className="price-input"
                />
              </td>
              <td>
                <button className="link-button" onClick={() => handleDelete(s.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

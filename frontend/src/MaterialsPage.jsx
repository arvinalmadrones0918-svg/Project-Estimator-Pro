import { useEffect, useState } from "react";
import { api } from "./api";

export default function MaterialsPage() {
  const [materials, setMaterials] = useState([]);
  const [form, setForm] = useState({ name: "", category: "", unit: "", unitPrice: "" });
  const [error, setError] = useState("");

  function load() {
    api.materials.list().then(setMaterials).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.name || !form.category || !form.unit || form.unitPrice === "") return;
    try {
      await api.materials.create({ ...form, unitPrice: Number(form.unitPrice) });
      setForm({ name: "", category: "", unit: "", unitPrice: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePriceChange(material, value) {
    const unitPrice = Number(value);
    if (Number.isNaN(unitPrice)) return;
    setMaterials((prev) => prev.map((m) => (m.id === material.id ? { ...m, unitPrice } : m)));
    try {
      await api.materials.update(material.id, { unitPrice });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await api.materials.remove(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h2>Materials Database</h2>
      {error && <p className="error">{error}</p>}

      <form className="inline-form" onSubmit={handleAdd}>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <input placeholder="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        <input
          placeholder="Unit price"
          type="number"
          step="0.01"
          value={form.unitPrice}
          onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
        />
        <button type="submit">Add Material</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Unit</th>
            <th>Unit Price ($)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>{m.category}</td>
              <td>{m.unit}</td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={m.unitPrice}
                  onChange={(e) => handlePriceChange(m, e.target.value)}
                  className="price-input"
                />
              </td>
              <td>
                <button className="link-button" onClick={() => handleDelete(m.id)}>
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

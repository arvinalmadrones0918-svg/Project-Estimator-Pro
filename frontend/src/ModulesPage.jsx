import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { api } from "./api";

const COST_COLORS = ["#2f6feb", "#e8893a"];

function money(n) {
  return `$${n.toFixed(2)}`;
}

export default function ModulesPage() {
  const [modules, setModules] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [error, setError] = useState("");

  function load() {
    api.modules.list().then((data) => {
      setModules(data);
      if (!selectedId && data.length > 0) setSelectedId(data[0].id);
    }).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleAddModule(e) {
    e.preventDefault();
    if (!form.name) return;
    try {
      const created = await api.modules.create(form);
      setForm({ name: "", description: "" });
      await load();
      setSelectedId(created.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteModule(id) {
    try {
      await api.modules.remove(id);
      if (selectedId === id) setSelectedId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const selected = modules.find((m) => m.id === selectedId);

  return (
    <div className="page modules-page">
      <div className="modules-sidebar">
        <h2>Work Modules</h2>
        {error && <p className="error">{error}</p>}
        <form className="stacked-form" onSubmit={handleAddModule}>
          <input placeholder="Module name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <button type="submit">Add Module</button>
        </form>
        <ul className="module-list">
          {modules.map((m) => (
            <li key={m.id} className={m.id === selectedId ? "selected" : ""}>
              <button className="link-button module-select" onClick={() => setSelectedId(m.id)}>
                {m.name}
              </button>
              <span className="module-total">{money(m.totalCost)}</span>
              <button className="link-button danger" onClick={() => handleDeleteModule(m.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="modules-detail">
        {selected ? (
          <ModuleDetail moduleSummary={selected} onChange={load} setError={setError} />
        ) : (
          <p>Select or create a work module.</p>
        )}
      </div>
    </div>
  );
}

function ModuleDetail({ moduleSummary, onChange, setError }) {
  const [detail, setDetail] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [specs, setSpecs] = useState([]);
  const [materialForm, setMaterialForm] = useState({ materialId: "", quantity: "" });
  const [laborForm, setLaborForm] = useState({ specializationId: "", quantity: "" });

  function loadDetail() {
    api.modules.get(moduleSummary.id).then(setDetail).catch((e) => setError(e.message));
  }

  useEffect(loadDetail, [moduleSummary.id]);
  useEffect(() => {
    api.materials.list().then(setMaterials).catch((e) => setError(e.message));
    api.laborSpecializations.list().then(setSpecs).catch((e) => setError(e.message));
  }, []);

  async function handleAddMaterial(e) {
    e.preventDefault();
    if (!materialForm.materialId || materialForm.quantity === "") return;
    try {
      await api.modules.addMaterial(moduleSummary.id, {
        materialId: Number(materialForm.materialId),
        quantity: Number(materialForm.quantity),
      });
      setMaterialForm({ materialId: "", quantity: "" });
      loadDetail();
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddLabor(e) {
    e.preventDefault();
    if (!laborForm.specializationId || laborForm.quantity === "") return;
    try {
      await api.modules.addLabor(moduleSummary.id, {
        specializationId: Number(laborForm.specializationId),
        quantity: Number(laborForm.quantity),
      });
      setLaborForm({ specializationId: "", quantity: "" });
      loadDetail();
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemoveMaterial(lineId) {
    try {
      await api.modules.removeMaterial(moduleSummary.id, lineId);
      loadDetail();
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemoveLabor(lineId) {
    try {
      await api.modules.removeLabor(moduleSummary.id, lineId);
      loadDetail();
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!detail) return <p>Loading...</p>;

  return (
    <div>
      <h2>{detail.name}</h2>
      {detail.description && <p className="description">{detail.description}</p>}

      <div className="cost-summary">
        <div className="cost-card">
          <div className="cost-label">Material Cost</div>
          <div className="cost-value">{money(detail.materialCost)}</div>
        </div>
        <div className="cost-card">
          <div className="cost-label">Labor Cost</div>
          <div className="cost-value">{money(detail.laborCost)}</div>
        </div>
        <div className="cost-card total">
          <div className="cost-label">Total Cost</div>
          <div className="cost-value">{money(detail.totalCost)}</div>
        </div>
      </div>

      {detail.totalCost > 0 && (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={[
                  { name: "Material Cost", value: detail.materialCost },
                  { name: "Labor Cost", value: detail.laborCost },
                ]}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, value }) => `${name}: ${money(value)}`}
              >
                {COST_COLORS.map((color) => (
                  <Cell key={color} fill={color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => money(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <section>
        <h3>Materials</h3>
        <form className="inline-form" onSubmit={handleAddMaterial}>
          <select value={materialForm.materialId} onChange={(e) => setMaterialForm({ ...materialForm, materialId: e.target.value })}>
            <option value="">Select material</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({money(m.unitPrice)}/{m.unit})
              </option>
            ))}
          </select>
          <input
            placeholder="Quantity"
            type="number"
            step="0.01"
            value={materialForm.quantity}
            onChange={(e) => setMaterialForm({ ...materialForm, quantity: e.target.value })}
          />
          <button type="submit">Add Material</button>
        </form>
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>Unit Price</th>
              <th>Quantity</th>
              <th>Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {detail.materialLines.map((line) => (
              <tr key={line.id}>
                <td>{line.name}</td>
                <td>{money(line.unitPrice)} / {line.unit}</td>
                <td>{line.quantity}</td>
                <td>{money(line.cost)}</td>
                <td>
                  <button className="link-button danger" onClick={() => handleRemoveMaterial(line.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Labor (by specialization)</h3>
        <form className="inline-form" onSubmit={handleAddLabor}>
          <select
            value={laborForm.specializationId}
            onChange={(e) => setLaborForm({ ...laborForm, specializationId: e.target.value })}
          >
            <option value="">Select specialization</option>
            {specs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({money(s.hourlyRate)}/hr)
              </option>
            ))}
          </select>
          <input
            placeholder="Hours"
            type="number"
            step="0.01"
            value={laborForm.quantity}
            onChange={(e) => setLaborForm({ ...laborForm, quantity: e.target.value })}
          />
          <button type="submit">Add Labor</button>
        </form>
        <table>
          <thead>
            <tr>
              <th>Specialization</th>
              <th>Hourly Rate</th>
              <th>Hours</th>
              <th>Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {detail.laborLines.map((line) => (
              <tr key={line.id}>
                <td>{line.name}</td>
                <td>{money(line.hourlyRate)}/hr</td>
                <td>{line.quantity}</td>
                <td>{money(line.cost)}</td>
                <td>
                  <button className="link-button danger" onClick={() => handleRemoveLabor(line.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api";
import Modal from "../components/Modal";
import { money } from "../utils";

// Editable project-staff manpower library (monthly rates per role).
export default function GrStaffModal({ onClose, setError }) {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ role: "", monthlyRate: "" });

  function load() { api.gr.staff().then(setStaff).catch((e) => setError(e.message)); }
  useEffect(load, []);

  async function add(e) {
    e.preventDefault();
    if (!form.role) return;
    try { await api.gr.addStaff({ role: form.role, monthlyRate: Number(form.monthlyRate) || 0 }); setForm({ role: "", monthlyRate: "" }); load(); }
    catch (err) { setError(err.message); }
  }

  async function patch(s, field, value) {
    const v = field === "monthlyRate" ? Number(value) : value;
    if (s[field] === v) return;
    try { await api.gr.updateStaff(s.id, { [field]: v }); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <Modal title="Project Staff Library" onClose={onClose} width={560}>
      <form className="gr-add-row" onSubmit={add} style={{ marginBottom: "0.75rem" }}>
        <input placeholder="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} autoFocus />
        <input type="number" placeholder="Monthly Rate" value={form.monthlyRate} onChange={(e) => setForm({ ...form, monthlyRate: e.target.value })} />
        <button type="submit" className="primary-button">Add</button>
      </form>
      <table className="gr-item-table">
        <thead><tr><th>Role</th><th>Monthly Rate</th><th></th></tr></thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <td><input className="cell-input wide" defaultValue={s.role} onBlur={(e) => patch(s, "role", e.target.value)} /></td>
              <td><input className="cell-input num" type="number" defaultValue={s.monthlyRate} onBlur={(e) => patch(s, "monthlyRate", e.target.value)} /></td>
              <td><button className="link-button danger" onClick={() => api.gr.removeStaff(s.id).then(load)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

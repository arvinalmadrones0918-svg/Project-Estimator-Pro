import { useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../utils";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import SuppliersPage from "./SuppliersPage";

// Phase 8 — project-centric procurement, integrated into the Project Explorer.
// Tabs cover the full pipeline without redesigning the existing workspace.
const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "suppliers", label: "Suppliers" },
  { key: "rfqs", label: "RFQs" },
  { key: "bids", label: "Bid Comparison" },
  { key: "requests", label: "Purchase Requests" },
  { key: "orders", label: "Purchase Orders" },
  { key: "performance", label: "Supplier Performance" },
];

const WORKFLOW = ["draft", "for_approval", "approved", "rejected", "cancelled"];
const statusLabel = (s) => (s || "draft").replace(/_/g, " ");

function StatusPill({ status }) {
  return <span className={`proc-pill proc-${(status || "draft").replace(/_/g, "-")}`}>{statusLabel(status)}</span>;
}

export default function ProcurementWorkspace({ projectId }) {
  const [tab, setTab] = useState("dashboard");
  const [error, setError] = useState("");
  return (
    <div className="procurement-workspace">
      <div className="catalog-toolbar"><h2 className="catalog-title">Procurement</h2></div>
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="proc-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`proc-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      <div className="proc-tab-body">
        {tab === "dashboard" && <DashboardTab projectId={projectId} setError={setError} />}
        {tab === "suppliers" && <SuppliersPage />}
        {tab === "rfqs" && <RfqTab projectId={projectId} setError={setError} />}
        {tab === "bids" && <BidTab projectId={projectId} setError={setError} />}
        {tab === "requests" && <RequestsTab projectId={projectId} setError={setError} />}
        {tab === "orders" && <OrdersTab projectId={projectId} setError={setError} />}
        {tab === "performance" && <PerformanceTab setError={setError} />}
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function DashboardTab({ projectId, setError }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.purchasing.dashboard(projectId).then(setData).catch((e) => setError(e.message)); }, [projectId]);
  if (!data) return <Spinner label="Loading procurement dashboard…" />;
  const s = data.stats;
  const bp = data.budgetVsProcurement;
  const cards = [
    { label: "Outstanding RFQs", value: s.outstandingRfqs },
    { label: "Pending Quotations", value: s.pendingQuotations },
    { label: "Awarded Suppliers", value: s.awardedSuppliers },
    { label: "Purchase Orders", value: s.purchaseOrders },
    { label: "Purchase Requests", value: s.purchaseRequests },
  ];
  return (
    <div>
      <div className="proc-cards">
        {cards.map((c) => (
          <div key={c.label} className="proc-card"><div className="proc-card-value">{c.value}</div><div className="proc-card-label">{c.label}</div></div>
        ))}
      </div>
      <div className="proc-budget">
        <h3>Budget vs Procurement</h3>
        <div className="proc-budget-row"><span>Estimate Budget</span><strong>{money(bp.budget)}</strong></div>
        <div className="proc-budget-row"><span>Committed (POs)</span><strong>{money(bp.procurement)}</strong></div>
        <div className={`proc-budget-row ${bp.variance < 0 ? "over" : "under"}`}><span>Variance</span><strong>{money(bp.variance)}</strong></div>
      </div>
    </div>
  );
}

// ── RFQs ─────────────────────────────────────────────────────────────────────
function RfqTab({ projectId, setError }) {
  const [rfqs, setRfqs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);

  function load() { api.purchasing.rfqs(projectId).then(setRfqs).catch((e) => setError(e.message)); }
  useEffect(load, [projectId]);

  async function changeStatus(rfq, status) {
    try { await api.purchasing.setRfqStatus(rfq.id, status); load(); if (selected?.id === rfq.id) openDetail(rfq.id); }
    catch (e) { setError(e.message); }
  }
  async function openDetail(id) { try { setSelected(await api.purchasing.rfq(id)); } catch (e) { setError(e.message); } }

  return (
    <div className="proc-split">
      <div className="proc-list-col">
        <button className="primary-button" onClick={() => setCreating(true)}>+ Generate RFQ from Estimate</button>
        <table className="proc-table">
          <thead><tr><th>RFQ No.</th><th>Title</th><th>Status</th></tr></thead>
          <tbody>
            {rfqs.map((r) => (
              <tr key={r.id} className={selected?.id === r.id ? "active" : ""} onClick={() => openDetail(r.id)}>
                <td>{r.rfqNumber}</td><td>{r.title}</td><td><StatusPill status={r.status} /></td>
              </tr>
            ))}
            {rfqs.length === 0 && <tr><td colSpan={3} className="empty-state">No RFQs yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="proc-detail-col">
        {selected ? (
          <RfqDetail rfq={selected} onStatus={changeStatus} onChanged={() => openDetail(selected.id)} setError={setError} />
        ) : <p className="empty-state">Select an RFQ.</p>}
      </div>
      {creating && <CreateRfqModal projectId={projectId} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} setError={setError} />}
    </div>
  );
}

function RfqDetail({ rfq, onStatus, onChanged, setError }) {
  const [quotes, setQuotes] = useState([]);
  const [quoting, setQuoting] = useState(false);
  function loadQuotes() { api.purchasing.quotations(rfq.id).then(setQuotes).catch((e) => setError(e.message)); }
  useEffect(loadQuotes, [rfq.id]);

  return (
    <div>
      <div className="proc-detail-head">
        <h3>{rfq.rfqNumber} — {rfq.title}</h3>
        <div className="proc-status-actions">
          <StatusPill status={rfq.status} />
          <select value="" onChange={(e) => e.target.value && onStatus(rfq, e.target.value)}>
            <option value="">Set status…</option>
            {WORKFLOW.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </div>
      </div>
      <h4>Items ({rfq.items.length})</h4>
      <table className="proc-table">
        <thead><tr><th>Description</th><th>Unit</th><th>Qty</th></tr></thead>
        <tbody>{rfq.items.map((i) => <tr key={i.id}><td>{i.description}</td><td>{i.unit}</td><td>{i.quantity}</td></tr>)}</tbody>
      </table>
      <div className="proc-detail-head">
        <h4>Supplier Quotations ({quotes.length})</h4>
        <button className="secondary-button" onClick={() => setQuoting(true)}>+ Add Quotation</button>
      </div>
      <table className="proc-table">
        <thead><tr><th>Supplier</th><th>Quote No.</th><th>Lead Time</th><th>Total</th><th></th></tr></thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id} className={q.isAwarded ? "awarded" : ""}>
              <td>{q.companyName}{q.isAwarded ? " ★" : ""}</td><td>{q.quoteNumber}</td>
              <td>{q.leadTimeDays != null ? `${q.leadTimeDays} d` : "—"}</td><td>{money(q.total)}</td>
              <td><AttachmentButton entityType="quotation" entityId={q.id} setError={setError} /></td>
            </tr>
          ))}
          {quotes.length === 0 && <tr><td colSpan={5} className="empty-state">No quotations.</td></tr>}
        </tbody>
      </table>
      <AttachmentList entityType="rfq" entityId={rfq.id} setError={setError} />
      {quoting && <QuotationModal rfq={rfq} onClose={() => setQuoting(false)} onSaved={() => { setQuoting(false); loadQuotes(); }} setError={setError} />}
    </div>
  );
}

function CreateRfqModal({ projectId, onClose, onCreated, setError }) {
  const [title, setTitle] = useState("");
  const [items, setItems] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [suppliers, setSuppliers] = useState([]);
  const [pickedSup, setPickedSup] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.purchasing.estimateItems(projectId).then(setItems).catch((e) => setError(e.message));
    api.suppliers.list({ status: "active" }).then((r) => setSuppliers(Array.isArray(r) ? r : r.items || [])).catch(() => {});
  }, [projectId]);

  function toggle(set, setter, key) { const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); setter(n); }

  async function submit() {
    if (!title) { setError("Title is required."); return; }
    setSaving(true);
    try {
      const chosen = items.filter((it) => picked.has(`${it.sourceType}:${it.sourceRefId}`));
      await api.purchasing.createRfq({
        projectId, title,
        items: chosen.length ? chosen : undefined,
        fromEstimate: chosen.length === 0,
        supplierIds: [...pickedSup],
      });
      onCreated();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal proc-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Generate RFQ from Estimate</h3>
        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rebar package RFQ" /></label>
        <p className="proc-hint">Select estimate items (none selected = include all):</p>
        <div className="proc-pick-list">
          {items.map((it) => {
            const key = `${it.sourceType}:${it.sourceRefId}`;
            return (
              <label key={key} className="checkbox-label">
                <input type="checkbox" checked={picked.has(key)} onChange={() => toggle(picked, setPicked, key)} />
                {it.description} — {it.quantity} {it.unit} ({it.sourceType})
              </label>
            );
          })}
          {items.length === 0 && <p className="empty-state">No estimate items in this project.</p>}
        </div>
        <p className="proc-hint">Invite suppliers:</p>
        <div className="proc-pick-list">
          {suppliers.map((s) => (
            <label key={s.id} className="checkbox-label">
              <input type="checkbox" checked={pickedSup.has(s.id)} onChange={() => toggle(pickedSup, setPickedSup, s.id)} />
              {s.companyName}
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create RFQ"}</button>
        </div>
      </div>
    </div>
  );
}

function QuotationModal({ rfq, onClose, onSaved, setError }) {
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [prices, setPrices] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.suppliers.list({ status: "active" }).then((r) => setSuppliers(Array.isArray(r) ? r : r.items || [])).catch(() => {}); }, []);

  async function submit() {
    if (!supplierId) { setError("Choose a supplier."); return; }
    setSaving(true);
    try {
      await api.purchasing.createQuotation(rfq.id, {
        supplierId: Number(supplierId),
        leadTimeDays: leadTimeDays === "" ? null : Number(leadTimeDays),
        items: rfq.items.map((it) => ({ rfqItemId: it.id, unitPrice: Number(prices[it.id]) || 0 })),
      });
      onSaved();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal proc-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add Supplier Quotation</h3>
        <label>Supplier
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Select…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
          </select>
        </label>
        <label>Lead Time (days)<input type="number" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} /></label>
        <table className="proc-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th></tr></thead>
          <tbody>
            {rfq.items.map((it) => (
              <tr key={it.id}>
                <td>{it.description}</td><td>{it.quantity}</td>
                <td><input type="number" className="proc-price-input" value={prices[it.id] ?? ""} onChange={(e) => setPrices({ ...prices, [it.id]: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Quotation"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Bid comparison ───────────────────────────────────────────────────────────
function BidTab({ projectId, setError }) {
  const [rfqs, setRfqs] = useState([]);
  const [rfqId, setRfqId] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => { api.purchasing.rfqs(projectId).then((r) => { setRfqs(r); if (r[0]) setRfqId(String(r[0].id)); }).catch((e) => setError(e.message)); }, [projectId]);
  useEffect(() => { if (rfqId) api.purchasing.bidComparison(rfqId).then(setData).catch((e) => setError(e.message)); }, [rfqId]);

  async function award(quotationId) {
    try { await api.purchasing.award(quotationId); const d = await api.purchasing.bidComparison(rfqId); setData(d); }
    catch (e) { setError(e.message); }
  }
  async function makePo(quotationId) {
    try { await api.purchasing.poFromQuotation(quotationId); alert("Purchase order generated. See the Purchase Orders tab."); }
    catch (e) { setError(e.message); }
  }

  return (
    <div>
      <label>RFQ
        <select value={rfqId} onChange={(e) => setRfqId(e.target.value)}>
          {rfqs.map((r) => <option key={r.id} value={r.id}>{r.rfqNumber} — {r.title}</option>)}
        </select>
      </label>
      {!data ? <p className="empty-state">Select an RFQ with quotations.</p> : data.columns.length === 0 ? (
        <p className="empty-state">No quotations to compare.</p>
      ) : (
        <table className="proc-table proc-bid">
          <thead>
            <tr>
              <th>Item</th>
              {data.columns.map((c) => (
                <th key={c.quotationId} className={c.isBestValue ? "best" : c.isLowest ? "lowest" : ""}>
                  {c.supplier}
                  {c.isLowest && <span className="proc-flag lowest">Lowest</span>}
                  {c.isBestValue && <span className="proc-flag best">Best Value</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((it) => (
              <tr key={it.id}>
                <td>{it.description} <em>({it.quantity} {it.unit})</em></td>
                {data.columns.map((c) => <td key={c.quotationId}>{c.priceByItem[it.id] != null ? money(c.priceByItem[it.id]) : "—"}</td>)}
              </tr>
            ))}
            <tr className="proc-total-row">
              <td>Total</td>
              {data.columns.map((c) => <td key={c.quotationId} className={c.isLowest ? "lowest" : ""}>{money(c.total)}</td>)}
            </tr>
            <tr>
              <td>Variance vs Lowest</td>
              {data.columns.map((c) => <td key={c.quotationId}>{c.variance ? money(c.variance) : "—"}</td>)}
            </tr>
            <tr>
              <td>Lead Time</td>
              {data.columns.map((c) => <td key={c.quotationId}>{c.leadTimeDays != null ? `${c.leadTimeDays} d` : "—"}</td>)}
            </tr>
            <tr>
              <td>Remarks</td>
              {data.columns.map((c) => <td key={c.quotationId}>{c.remarks || "—"}</td>)}
            </tr>
            <tr>
              <td></td>
              {data.columns.map((c) => (
                <td key={c.quotationId}>
                  <button className="link-button" onClick={() => award(c.quotationId)}>{c.isAwarded ? "★ Awarded" : "Award"}</button>
                  {c.isAwarded && <button className="link-button" onClick={() => makePo(c.quotationId)}>→ PO</button>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Purchase requests ────────────────────────────────────────────────────────
function RequestsTab({ projectId, setError }) {
  const [rows, setRows] = useState([]);
  function load() { api.purchasing.purchaseRequests(projectId).then(setRows).catch((e) => setError(e.message)); }
  useEffect(load, [projectId]);

  async function generate() {
    const title = window.prompt("Purchase request title:", "Approved items PR");
    if (!title) return;
    try { await api.purchasing.createPurchaseRequest({ projectId, title, fromEstimate: true }); load(); }
    catch (e) { setError(e.message); }
  }
  async function setStatus(id, status) { try { await api.purchasing.setPrStatus(id, status); load(); } catch (e) { setError(e.message); } }

  return (
    <div>
      <button className="primary-button" onClick={generate}>+ Generate Purchase Request from Estimate</button>
      <table className="proc-table">
        <thead><tr><th>PR No.</th><th>Title</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.prNumber}</td><td>{r.title}</td><td><StatusPill status={r.status} /></td>
              <td>
                <select value="" onChange={(e) => e.target.value && setStatus(r.id, e.target.value)}>
                  <option value="">Set status…</option>
                  {WORKFLOW.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="empty-state">No purchase requests.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── Purchase orders ──────────────────────────────────────────────────────────
function OrdersTab({ projectId, setError }) {
  const [rows, setRows] = useState([]);
  function load() { api.purchasing.purchaseOrders(projectId).then(setRows).catch((e) => setError(e.message)); }
  useEffect(load, [projectId]);
  async function setStatus(id, status) { try { await api.purchasing.setPoStatus(id, status); load(); } catch (e) { setError(e.message); } }

  return (
    <table className="proc-table">
      <thead><tr><th>PO No.</th><th>Supplier</th><th>Amount</th><th>Approval</th><th></th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.poNumber}</td><td>{r.supplier}</td><td>{money(r.amount)}</td><td><StatusPill status={r.approvalStatus} /></td>
            <td>
              <select value="" onChange={(e) => e.target.value && setStatus(r.id, e.target.value)}>
                <option value="">Set status…</option>
                {WORKFLOW.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
            </td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={5} className="empty-state">No purchase orders. Award a quotation in Bid Comparison to generate one.</td></tr>}
      </tbody>
    </table>
  );
}

// ── Supplier performance ─────────────────────────────────────────────────────
function PerformanceTab({ setError }) {
  const [scorecard, setScorecard] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState({ supplierId: "", deliveryRating: 5, qualityRating: 5, priceRating: 5, remarks: "" });

  function load() { api.purchasing.scorecard().then(setScorecard).catch((e) => setError(e.message)); }
  useEffect(() => { load(); api.suppliers.list({ status: "active" }).then((r) => setSuppliers(Array.isArray(r) ? r : r.items || [])).catch(() => {}); }, []);

  async function submit() {
    if (!form.supplierId) { setError("Choose a supplier."); return; }
    try {
      await api.purchasing.addPerformance({ ...form, supplierId: Number(form.supplierId) });
      setForm({ supplierId: "", deliveryRating: 5, qualityRating: 5, priceRating: 5, remarks: "" });
      load();
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="proc-split">
      <div className="proc-list-col">
        <h4>Supplier Scorecard</h4>
        <table className="proc-table">
          <thead><tr><th>Supplier</th><th>Delivery</th><th>Quality</th><th>Price</th><th>Overall</th></tr></thead>
          <tbody>
            {scorecard.map((r) => (
              <tr key={r.supplierId}><td>{r.companyName}</td><td>{r.avgDelivery}</td><td>{r.avgQuality}</td><td>{r.avgPrice}</td><td><strong>{r.avgOverall}</strong></td></tr>
            ))}
            {scorecard.length === 0 && <tr><td colSpan={5} className="empty-state">No evaluations yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="proc-detail-col">
        <h4>Evaluate Supplier</h4>
        <label>Supplier
          <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
            <option value="">Select…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
          </select>
        </label>
        {["deliveryRating", "qualityRating", "priceRating"].map((k) => (
          <label key={k}>{k.replace("Rating", "")} (0–5)
            <input type="number" min="0" max="5" step="0.5" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </label>
        ))}
        <label>Remarks<input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></label>
        <button className="primary-button" onClick={submit}>Save Evaluation</button>
      </div>
    </div>
  );
}

// ── Attachments ──────────────────────────────────────────────────────────────
function AttachmentButton({ entityType, entityId, setError }) {
  const [count, setCount] = useState(null);
  useEffect(() => { api.purchasing.attachments(entityType, entityId).then((r) => setCount(r.length)).catch(() => {}); }, [entityType, entityId]);
  return <span className="proc-attach-count" title="Attachments">📎 {count ?? 0}</span>;
}

function AttachmentList({ entityType, entityId, setError }) {
  const [files, setFiles] = useState([]);
  function load() { api.purchasing.attachments(entityType, entityId).then(setFiles).catch((e) => setError(e.message)); }
  useEffect(load, [entityType, entityId]);

  function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.purchasing.addAttachment({ entityType, entityId, fileName: file.name, fileType: file.type, size: file.size, dataUrl: reader.result });
        load();
      } catch (err) { setError(err.message); }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }
  async function remove(id) { try { await api.purchasing.removeAttachment(id); load(); } catch (e) { setError(e.message); } }

  return (
    <div className="proc-attachments">
      <div className="proc-detail-head">
        <h4>Attachments ({files.length})</h4>
        <label className="secondary-button proc-upload">
          + Upload (PDF / Excel / Drawing / Image)
          <input type="file" accept=".pdf,.xls,.xlsx,.dwg,.dxf,image/*" onChange={onPick} hidden />
        </label>
      </div>
      <ul className="proc-attach-list">
        {files.map((f) => (
          <li key={f.id}><span className="proc-attach-type">{f.fileType}</span> {f.fileName}
            <button className="link-button danger" onClick={() => remove(f.id)}>Remove</button></li>
        ))}
        {files.length === 0 && <li className="empty-state">No attachments.</li>}
      </ul>
    </div>
  );
}

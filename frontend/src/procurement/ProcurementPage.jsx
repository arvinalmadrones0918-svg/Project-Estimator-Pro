import { useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../utils";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import QuotationModal from "./QuotationModal";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "comparison", label: "Price Comparison" },
  { key: "packages", label: "Purchase Packages" },
  { key: "rfq", label: "RFQ" },
];

function StatCard({ label, value, accent }) {
  return (
    <div className={`proc-stat-card ${accent || ""}`}>
      <div className="proc-stat-value">{value}</div>
      <div className="proc-stat-label">{label}</div>
    </div>
  );
}

export default function ProcurementPage() {
  const [tab, setTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [comparison, setComparison] = useState([]);
  const [packages, setPackages] = useState(null);
  const [groupBy, setGroupBy] = useState("category");
  const [rfq, setRfq] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [rfqSupplier, setRfqSupplier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeMaterial, setActiveMaterial] = useState(null);

  function loadDashboard() {
    setLoading(true);
    api.procurement.dashboard().then(setDashboard).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }
  function loadComparison() {
    setLoading(true);
    api.procurement.comparisonTable().then(setComparison).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }
  function loadPackages() {
    setLoading(true);
    api.procurement.packages(groupBy).then(setPackages).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }

  useEffect(() => {
    if (tab === "dashboard") loadDashboard();
    if (tab === "comparison") loadComparison();
    if (tab === "packages") loadPackages();
    if (tab === "rfq") api.suppliers.list({ status: "active" }).then((d) => setSuppliers(Array.isArray(d) ? d : d.items)).catch(() => {});
  }, [tab]);

  useEffect(() => { if (tab === "packages") loadPackages(); }, [groupBy]);

  function refreshActive() {
    if (tab === "dashboard") loadDashboard();
    if (tab === "comparison") loadComparison();
  }

  async function generateRfq() {
    try { setRfq(await api.procurement.rfq({ supplierId: rfqSupplier || undefined })); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="procurement-page">
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="catalog-toolbar">
        <h2 className="catalog-title">Procurement</h2>
      </div>

      <nav className="proc-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </nav>

      {loading && <Spinner label="Loading…" />}

      {/* ── Dashboard ─────────────────────────────── */}
      {tab === "dashboard" && dashboard && !loading && (
        <div className="proc-dashboard">
          <div className="proc-stats-grid">
            <StatCard label="Awaiting Quotation" value={dashboard.stats.awaitingQuotation} accent="warn" />
            <StatCard label="Quoted Items" value={dashboard.stats.quotedCount} accent="ok" />
            <StatCard label="Expired Quotations" value={dashboard.stats.expiredQuotations} accent="danger" />
            <StatCard label="Multiple Quotations" value={dashboard.stats.multipleQuotations} />
            <StatCard label="Total Quotations" value={dashboard.stats.totalQuotations} />
            <StatCard label="Selected" value={dashboard.stats.selectedCount} accent="ok" />
          </div>

          <h3>Items Awaiting Quotation</h3>
          {dashboard.awaitingList.length === 0 ? (
            <p className="empty-state-small">All materials have at least one quotation.</p>
          ) : (
            <table className="catalog-grid">
              <thead><tr><th>Code</th><th>Material</th><th>Category</th><th>Unit</th><th>Current Price</th><th>Action</th></tr></thead>
              <tbody>
                {dashboard.awaitingList.map((m) => (
                  <tr key={m.id}>
                    <td>{m.code || "—"}</td>
                    <td>{m.name}</td>
                    <td>{m.category}</td>
                    <td>{m.unit}</td>
                    <td>{money(m.unitPrice)}</td>
                    <td><button className="link-button" onClick={() => setActiveMaterial(m)}>Add Quotation</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Price comparison ──────────────────────── */}
      {tab === "comparison" && !loading && (
        <div className="proc-comparison">
          {comparison.length === 0 ? (
            <p className="empty-state">No quoted materials yet. Add quotations from the Dashboard.</p>
          ) : (
            <table className="catalog-grid">
              <thead>
                <tr>
                  <th>Material</th><th>Quotes</th><th>Lowest</th><th>Highest</th>
                  <th>Average</th><th>Selected</th><th>Variance</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((c) => (
                  <tr key={c.materialId}>
                    <td>{c.materialName}</td>
                    <td>{c.quotationCount}</td>
                    <td className="quote-lowest">{c.lowest != null ? money(c.lowest) : "—"}</td>
                    <td>{c.highest != null ? money(c.highest) : "—"}</td>
                    <td>{c.average != null ? money(c.average) : "—"}</td>
                    <td>{c.selected ? `${c.selected.supplierName} (${money(c.selected.quotedUnitCost)})` : <span className="muted">none</span>}</td>
                    <td>{c.priceVariance != null ? money(c.priceVariance) : "—"}</td>
                    <td><button className="link-button" onClick={() => setActiveMaterial({ id: c.materialId, name: c.materialName, unitPrice: c.currentUnitPrice })}>Manage</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Purchase packages ─────────────────────── */}
      {tab === "packages" && packages && !loading && (
        <div className="proc-packages">
          <div className="proc-packages-head">
            <label>
              Group by:
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                <option value="category">WBS Category</option>
                <option value="supplier">Supplier</option>
              </select>
            </label>
          </div>
          {packages.packages.length === 0 ? (
            <p className="empty-state">No materials in use yet. Add materials to work items first.</p>
          ) : (
            packages.packages.map((pkg) => (
              <div key={pkg.key} className="package-card">
                <div className="package-head">
                  <h3>{pkg.key}</h3>
                  <span className="package-total">{money(pkg.total)}</span>
                </div>
                <table className="catalog-grid">
                  <thead><tr><th>Code</th><th>Material</th><th>Unit</th><th>Selected Supplier</th><th>Line Cost</th></tr></thead>
                  <tbody>
                    {pkg.items.map((it) => (
                      <tr key={it.materialId}>
                        <td>{it.code || "—"}</td>
                        <td>{it.name}</td>
                        <td>{it.unit}</td>
                        <td>{it.selectedSupplier || <span className="muted">unassigned</span>}</td>
                        <td>{money(it.lineCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── RFQ ───────────────────────────────────── */}
      {tab === "rfq" && (
        <div className="proc-rfq">
          <div className="rfq-controls">
            <label>
              Supplier (optional):
              <select value={rfqSupplier} onChange={(e) => setRfqSupplier(e.target.value)}>
                <option value="">— Generic —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
              </select>
            </label>
            <button className="primary-button" onClick={generateRfq}>Generate RFQ</button>
            {rfq && <button className="secondary-button" onClick={() => window.print()}>Print</button>}
          </div>

          {rfq && (
            <div className="rfq-document">
              <div className="rfq-header">
                <h1>Request for Quotation</h1>
                <div className="rfq-meta">
                  <div><strong>Reference:</strong> {rfq.reference}</div>
                  <div><strong>Date:</strong> {new Date(rfq.generatedAt).toLocaleDateString()}</div>
                </div>
              </div>
              {rfq.supplier && (
                <div className="rfq-supplier">
                  <strong>To:</strong> {rfq.supplier.companyName}
                  {rfq.supplier.contactPerson && <> · Attn: {rfq.supplier.contactPerson}</>}
                  {rfq.supplier.email && <> · {rfq.supplier.email}</>}
                </div>
              )}
              <p>We invite you to quote on the following items:</p>
              <table className="rfq-table">
                <thead><tr><th>#</th><th>Code</th><th>Description</th><th>Category</th><th>Unit</th><th>Quoted Price</th><th>Lead Time</th></tr></thead>
                <tbody>
                  {rfq.materials.map((m, i) => (
                    <tr key={m.id}>
                      <td>{i + 1}</td><td>{m.code || "—"}</td><td>{m.name}</td>
                      <td>{m.category}</td><td>{m.unit}</td><td className="rfq-blank"></td><td className="rfq-blank"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="rfq-footer">Please return your quotation with validity period, delivery and payment terms.</p>
            </div>
          )}
        </div>
      )}

      {activeMaterial && (
        <QuotationModal
          material={activeMaterial}
          onClose={() => setActiveMaterial(null)}
          onChanged={refreshActive}
        />
      )}
    </div>
  );
}

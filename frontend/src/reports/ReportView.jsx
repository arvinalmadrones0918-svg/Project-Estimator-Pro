import { Fragment } from "react";
import { money } from "../utils";

// Renders the body of any report kind. The print layout (page size/orientation)
// is owned by the parent's .report-paper wrapper.
export default function ReportView({ report, project }) {
  const { kind, data, label, generatedAt } = report;

  return (
    <div className="report-doc">
      {/* Professional header */}
      <header className="report-header">
        <div className="report-company">
          <div className="report-logo">PE</div>
          <div>
            <div className="report-company-name">Project Estimator Pro</div>
            <div className="report-company-sub">Professional Cost Estimating</div>
          </div>
        </div>
        <div className="report-title-block">
          <h1>{label}</h1>
          {project && <div className="report-project-name">{project.name}</div>}
        </div>
      </header>

      {project && (
        <div className="report-meta-grid">
          <div><strong>Project:</strong> {project.name}</div>
          <div><strong>Client:</strong> {project.client || "—"}</div>
          <div><strong>Project No.:</strong> {project.projectNumber || "—"}</div>
          <div><strong>Location:</strong> {project.location || "—"}</div>
          <div><strong>Estimator:</strong> {project.estimator || "—"}</div>
          <div><strong>Generated:</strong> {new Date(generatedAt).toLocaleString()}</div>
        </div>
      )}

      <div className="report-body">
        {kind === "boq" && <BoqBody data={data} />}
        {kind === "summary" && <SummaryBody data={data} />}
        {(kind === "breakdown" || kind === "project") && <WaterfallBody data={data} />}
        {kind === "wbs" && <WbsBody data={data} />}
        {kind === "upa" && <UpaBody data={data} />}
        {kind === "procurement" && <ProcurementBody data={data} />}
        {kind === "supplier" && <SupplierBody data={data} />}
      </div>

      <footer className="report-footer">
        <span>Project Estimator Pro</span>
        <span>Generated {new Date(generatedAt).toLocaleDateString()}</span>
      </footer>
    </div>
  );
}

function BoqBody({ data }) {
  return (
    <table className="report-table boq-table">
      <thead>
        <tr>
          <th>Item No.</th><th>Code</th><th>Description</th><th>Unit</th>
          <th className="num">Quantity</th><th className="num">Unit Rate</th><th className="num">Amount</th><th>Remarks</th>
        </tr>
      </thead>
      <tbody>
        {data.groups.map((g) => (
          <Fragment key={g.name}>
            <tr className="boq-group">
              <td colSpan={8}>{g.name}</td>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.itemNo}>
                <td>{r.itemNo}</td><td>{r.code}</td><td>{r.description}</td><td>{r.unit}</td>
                <td className="num">{r.quantity}</td><td className="num">{money(r.rate)}</td>
                <td className="num">{money(r.amount)}</td><td>{r.remarks}</td>
              </tr>
            ))}
            <tr className="boq-subtotal">
              <td colSpan={6}>Subtotal — {g.name}</td>
              <td className="num">{money(g.subtotal)}</td><td></td>
            </tr>
          </Fragment>
        ))}
        <tr className="boq-grand">
          <td colSpan={6}>GRAND TOTAL</td>
          <td className="num">{money(data.grandTotal)}</td><td></td>
        </tr>
      </tbody>
    </table>
  );
}

function SummaryBody({ data }) {
  return (
    <table className="report-table">
      <thead><tr><th>Code</th><th>Description</th><th>Unit</th><th className="num">Quantity</th><th className="num">Amount</th></tr></thead>
      <tbody>
        {data.rows.map((r, i) => (
          <tr key={i}><td>{r.code || "—"}</td><td>{r.description}</td><td>{r.unit}</td><td className="num">{r.quantity}</td><td className="num">{money(r.amount)}</td></tr>
        ))}
        <tr className="boq-grand"><td colSpan={4}>TOTAL</td><td className="num">{money(data.total)}</td></tr>
      </tbody>
    </table>
  );
}

function WaterfallBody({ data }) {
  const w = data.waterfall;
  return (
    <table className="report-table">
      <tbody>
        <tr><td>Direct Cost</td><td className="num">{money(w.directCost)}</td></tr>
        {w.indirectLines.map((l) => <tr key={l.id}><td className="indent">+ {l.name}</td><td className="num">{money(l.amount)}</td></tr>)}
        <tr className="boq-subtotal"><td>Subtotal</td><td className="num">{money(w.subtotal)}</td></tr>
        {w.vatLines.map((l) => <tr key={l.id}><td className="indent">+ {l.name}</td><td className="num">{money(l.amount)}</td></tr>)}
        <tr className="boq-subtotal"><td>Bid Price</td><td className="num">{money(w.bidPrice)}</td></tr>
        {w.discountLines.map((l) => <tr key={l.id}><td className="indent">− {l.name}</td><td className="num">−{money(l.amount)}</td></tr>)}
        <tr className="boq-grand"><td>Final Tender Price</td><td className="num">{money(w.finalTenderPrice)}</td></tr>
      </tbody>
    </table>
  );
}

function WbsBody({ data }) {
  return (
    <table className="report-table">
      <thead><tr><th>Category</th><th className="num">Material</th><th className="num">Labor</th><th className="num">Equipment</th><th className="num">Subcontract</th><th className="num">Other</th><th className="num">Direct Cost</th></tr></thead>
      <tbody>
        {data.wbsCategories.map((c) => (
          <tr key={c.id ?? c.name}><td>{c.name}</td><td className="num">{money(c.materialCost)}</td><td className="num">{money(c.laborCost)}</td><td className="num">{money(c.equipmentCost)}</td><td className="num">{money(c.subcontractCost)}</td><td className="num">{money(c.otherCost)}</td><td className="num">{money(c.directCost)}</td></tr>
        ))}
        <tr className="boq-grand"><td colSpan={6}>PROJECT DIRECT COST</td><td className="num">{money(data.directCost)}</td></tr>
      </tbody>
    </table>
  );
}

function UpaBody({ data }) {
  return (
    <table className="report-table">
      <thead><tr><th>Code</th><th>Description</th><th>Trade</th><th>Unit</th><th className="num">Material</th><th className="num">Labor</th><th className="num">Equipment</th><th className="num">Unit Rate</th></tr></thead>
      <tbody>
        {data.upas.map((u, i) => (
          <tr key={i}><td>{u.code || "—"}</td><td>{u.description}</td><td>{u.trade || "—"}</td><td>{u.unit}</td><td className="num">{money(u.materialCost)}</td><td className="num">{money(u.laborCost)}</td><td className="num">{money(u.equipmentCost)}</td><td className="num">{money(u.unitRate)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function ProcurementBody({ data }) {
  return (
    <table className="report-table">
      <thead><tr><th>Code</th><th>Description</th><th>Unit</th><th className="num">Current Price</th><th className="num">Quotes</th><th>Selected Supplier</th></tr></thead>
      <tbody>
        {data.rows.map((r, i) => (
          <tr key={i}><td>{r.code || "—"}</td><td>{r.description}</td><td>{r.unit}</td><td className="num">{money(r.unitPrice)}</td><td className="num">{r.quotes}</td><td>{r.selectedSupplier || "—"}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function SupplierBody({ data }) {
  return (
    <table className="report-table">
      <thead><tr><th>Code</th><th>Material</th><th>Unit</th><th className="num">Lowest</th><th className="num">Highest</th><th className="num">Average</th><th>Suppliers</th></tr></thead>
      <tbody>
        {data.rows.map((r, i) => (
          <tr key={i}>
            <td>{r.code || "—"}</td><td>{r.name}</td><td>{r.unit}</td>
            <td className="num">{r.lowest != null ? money(r.lowest) : "—"}</td>
            <td className="num">{r.highest != null ? money(r.highest) : "—"}</td>
            <td className="num">{r.average != null ? money(r.average) : "—"}</td>
            <td>{r.quotes.map((q) => `${q.supplier} (${money(q.cost)})${q.isSelected ? " ✓" : ""}`).join(", ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import RegisterTable from "./RegisterTable";
import DocumentsPanel from "./DocumentsPanel";
import BidComparison from "./BidComparison";

// Field configs for each register (shared by the generic RegisterTable).
const TENDER_FIELDS = [
  { key: "tenderNo", label: "Tender No." },
  { key: "bidTitle", label: "Bid Title", span: true },
  { key: "client", label: "Client" },
  { key: "projectId", label: "Project ID", type: "number" },
  { key: "bidDate", label: "Bid Date", type: "date" },
  { key: "submissionDate", label: "Submission Date", type: "date" },
  { key: "openingDate", label: "Opening Date", type: "date" },
  { key: "engineer", label: "Engineer" },
  { key: "estimator", label: "Estimator" },
  { key: "status", label: "Status", options: ["open", "submitted", "awarded", "lost", "cancelled"] },
  { key: "currency", label: "Currency" },
  { key: "remarks", label: "Remarks", type: "textarea", span: true },
];

const CLIENT_FIELDS = [
  { key: "company", label: "Company", span: true },
  { key: "owner", label: "Owner" },
  { key: "contactPerson", label: "Contact Person" },
  { key: "telephone", label: "Telephone" },
  { key: "email", label: "Email", type: "email" },
  { key: "address", label: "Address", type: "textarea", span: true },
  { key: "tin", label: "TIN" },
  { key: "taxType", label: "Tax Type" },
  { key: "paymentTerms", label: "Payment Terms" },
  { key: "preferredContractor", label: "Preferred Contractor" },
];

const DRAWING_FIELDS = [
  { key: "drawingNumber", label: "Drawing Number" },
  { key: "revision", label: "Revision" },
  { key: "discipline", label: "Discipline" },
  { key: "title", label: "Title", span: true },
  { key: "issueDate", label: "Issue Date", type: "date" },
  { key: "currentRevision", label: "Current Revision" },
  { key: "supersededRevisions", label: "Superseded Revisions" },
  { key: "projectId", label: "Project ID", type: "number" },
];

const SPEC_FIELDS = [
  { key: "division", label: "Division" },
  { key: "section", label: "Section" },
  { key: "description", label: "Description", span: true },
  { key: "revision", label: "Revision" },
  { key: "specDate", label: "Date", type: "date" },
  { key: "linkedBoqItems", label: "Linked BOQ Items" },
  { key: "projectId", label: "Project ID", type: "number" },
];

const ADDENDUM_FIELDS = [
  { key: "addendumNumber", label: "Addendum Number" },
  { key: "addendumDate", label: "Date", type: "date" },
  { key: "affectedItems", label: "Affected Items", span: true },
  { key: "costImpact", label: "Cost Impact", type: "number", money: true },
  { key: "description", label: "Description", type: "textarea", span: true },
  { key: "projectId", label: "Project ID", type: "number" },
];

const RFI_FIELDS = [
  { key: "requestNumber", label: "Request Number" },
  { key: "status", label: "Status", options: ["open", "answered", "closed"] },
  { key: "question", label: "Question", type: "textarea", span: true },
  { key: "answer", label: "Answer", type: "textarea", span: true },
  { key: "dateSent", label: "Date Sent", type: "date" },
  { key: "dateClosed", label: "Date Closed", type: "date" },
  { key: "linkedBoqItems", label: "Linked BOQ Items" },
  { key: "projectId", label: "Project ID", type: "number" },
];

const TABS = [
  { key: "tenders", label: "Tenders" },
  { key: "clients", label: "Clients" },
  { key: "documents", label: "Documents" },
  { key: "drawings", label: "Drawings" },
  { key: "specifications", label: "Specifications" },
  { key: "addenda", label: "Addenda" },
  { key: "rfis", label: "RFIs" },
  { key: "bid-comparison", label: "Bid Comparison" },
  { key: "change-log", label: "Change Log" },
];

export default function TenderingPage() {
  const [tab, setTab] = useState("tenders");
  const [error, setError] = useState("");

  return (
    <div className="tendering-page">
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="catalog-toolbar"><h2 className="catalog-title">Tendering & Bid Management</h2></div>

      <nav className="proc-tabs">
        {TABS.map((t) => <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </nav>

      {tab === "tenders" && <RegisterTable api={api.tenders} title="Tender" fields={TENDER_FIELDS} columns={["tenderNo", "bidTitle", "client", "status", "submissionDate"]} requireReason setError={setError} />}
      {tab === "clients" && <RegisterTable api={api.clients} title="Client" fields={CLIENT_FIELDS} columns={["company", "contactPerson", "email", "taxType", "paymentTerms"]} requireReason setError={setError} />}
      {tab === "documents" && <DocumentsPanel setError={setError} />}
      {tab === "drawings" && <RegisterTable api={api.drawings} title="Drawing" fields={DRAWING_FIELDS} columns={["drawingNumber", "revision", "discipline", "title", "issueDate"]} setError={setError} />}
      {tab === "specifications" && <RegisterTable api={api.specifications} title="Specification" fields={SPEC_FIELDS} columns={["division", "section", "description", "revision"]} setError={setError} />}
      {tab === "addenda" && <RegisterTable api={api.addenda} title="Addendum" fields={ADDENDUM_FIELDS} columns={["addendumNumber", "addendumDate", "affectedItems", "costImpact"]} setError={setError} />}
      {tab === "rfis" && <RegisterTable api={api.rfis} title="RFI" fields={RFI_FIELDS} columns={["requestNumber", "question", "status", "dateSent", "dateClosed"]} setError={setError} />}
      {tab === "bid-comparison" && <BidComparison setError={setError} />}
      {tab === "change-log" && <ChangeLog setError={setError} />}
    </div>
  );
}

function ChangeLog({ setError }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.tendering.changeLog({ limit: 200 }).then(setRows).catch((e) => setError(e.message)); }, []);
  return (
    <div className="change-log">
      {rows.length === 0 ? <p className="empty-state-small">No changes recorded yet.</p> : (
        <table className="catalog-grid">
          <thead><tr><th>Date</th><th>Entity</th><th>Field</th><th>Previous</th><th>New</th><th>Reason</th><th>By</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.entityType} {r.entityId ? `#${r.entityId}` : ""}</td>
                <td>{r.field || "—"}</td>
                <td className="muted">{r.previousValue ?? "—"}</td>
                <td>{r.newValue ?? "—"}</td>
                <td>{r.reason || "—"}</td>
                <td>{r.changedBy || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

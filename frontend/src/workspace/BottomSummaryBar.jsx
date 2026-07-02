import { money } from "../utils";

export default function BottomSummaryBar({ totals }) {
  return (
    <div className="bottom-summary-bar">
      <div className="bottom-summary-item">
        <span>Material</span>
        <strong>{money(totals.materialCost)}</strong>
      </div>
      <div className="bottom-summary-item">
        <span>Labor</span>
        <strong>{money(totals.laborCost)}</strong>
      </div>
      <div className="bottom-summary-item">
        <span>Equipment</span>
        <strong>{money(totals.equipmentCost)}</strong>
      </div>
      <div className="bottom-summary-item">
        <span>Subcontract</span>
        <strong>{money(totals.subcontractCost)}</strong>
      </div>
      <div className="bottom-summary-item">
        <span>Other</span>
        <strong>{money(totals.otherCost)}</strong>
      </div>
      <div className="bottom-summary-item">
        <span>Direct Cost</span>
        <strong>{money(totals.directCost)}</strong>
      </div>
      <div className="bottom-summary-item total">
        <span>Final Tender Price</span>
        <strong>{money(totals.finalTenderPrice ?? totals.projectTotal)}</strong>
      </div>
    </div>
  );
}

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { money } from "../utils";

const COLORS = ["#2f6feb", "#e8893a", "#1faa59", "#9b51e0", "#e0455f", "#5bc0de"];

export default function CostSummaryPanel({ totals }) {
  const data = [
    { name: "Material", value: totals.materialCost },
    { name: "Labor", value: totals.laborCost },
    { name: "Equipment", value: totals.equipmentCost },
    { name: "Subcontract", value: totals.subcontractCost },
    { name: "Other", value: totals.otherCost },
    { name: "Assemblies", value: totals.assemblyCost },
  ].filter((d) => d.value > 0);

  return (
    <div className="cost-summary-panel">
      <h2>Cost Summary</h2>
      <div className="cost-summary">
        <div className="cost-card">
          <div className="cost-label">Material Cost</div>
          <div className="cost-value">{money(totals.materialCost)}</div>
        </div>
        <div className="cost-card">
          <div className="cost-label">Labor Cost</div>
          <div className="cost-value">{money(totals.laborCost)}</div>
        </div>
        <div className="cost-card">
          <div className="cost-label">Equipment Cost</div>
          <div className="cost-value">{money(totals.equipmentCost)}</div>
        </div>
        <div className="cost-card">
          <div className="cost-label">Subcontract Cost</div>
          <div className="cost-value">{money(totals.subcontractCost)}</div>
        </div>
        <div className="cost-card">
          <div className="cost-label">Other Cost</div>
          <div className="cost-value">{money(totals.otherCost)}</div>
        </div>
        <div className="cost-card">
          <div className="cost-label">Assembly Cost</div>
          <div className="cost-value">{money(totals.assemblyCost)}</div>
        </div>
        <div className="cost-card total">
          <div className="cost-label">Project Total</div>
          <div className="cost-value">{money(totals.projectTotal)}</div>
        </div>
      </div>
      {data.length > 0 && (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${money(value)}`}>
                {data.map((d, i) => (
                  <Cell key={d.name} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => money(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

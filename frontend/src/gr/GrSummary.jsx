import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { money } from "../utils";

const COLORS = ["#2f6feb", "#e8893a", "#1faa59", "#9b51e0", "#e0455f", "#5bc0de", "#f5a623", "#7ed321", "#bd10e0", "#50e3c2", "#b8e986"];

// Summary of a GR sheet: category totals, cost distribution pie, grand total,
// and percentage of total project cost. All numbers come from the engine calc.
export default function GrSummary({ calc }) {
  const data = calc.categories.filter((c) => c.total > 0).map((c) => ({ name: c.category, value: c.total }));

  return (
    <div className="gr-summary">
      <h4>Summary</h4>
      <div className="gr-summary-body">
        <div className="gr-summary-cards">
          {calc.categories.filter((c) => c.total > 0).map((c) => (
            <div key={c.category} className="gr-summary-card">
              <span>{c.category}</span>
              <strong>{money(c.total)}</strong>
            </div>
          ))}
          <div className="gr-summary-card subtotal"><span>Subtotal</span><strong>{money(calc.subtotal)}</strong></div>
          {calc.inflationAmount > 0 && <div className="gr-summary-card"><span>Inflation</span><strong>{money(calc.inflationAmount)}</strong></div>}
          {calc.escalationAmount > 0 && <div className="gr-summary-card"><span>Escalation</span><strong>{money(calc.escalationAmount)}</strong></div>}
          <div className="gr-summary-card total"><span>Grand Total</span><strong>{money(calc.grandTotal)}</strong></div>
          {calc.pctOfProjectValue != null && (
            <div className="gr-summary-card"><span>% of Project Value</span><strong>{calc.pctOfProjectValue.toFixed(2)}%</strong></div>
          )}
        </div>

        {data.length > 0 && (
          <div className="gr-summary-chart">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={({ name, percent }) => `${name.split(" ")[0]} ${(percent * 100).toFixed(0)}%`}>
                  {data.map((d, i) => <Cell key={d.name} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

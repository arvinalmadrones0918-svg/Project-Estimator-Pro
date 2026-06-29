import { useState } from "react";
import MaterialsPage from "./MaterialsPage";
import LaborPage from "./LaborPage";
import ModulesPage from "./ModulesPage";

const TABS = [
  { key: "modules", label: "Work Modules", component: ModulesPage },
  { key: "materials", label: "Materials Database", component: MaterialsPage },
  { key: "labor", label: "Labor Specializations", component: LaborPage },
];

export default function App() {
  const [tab, setTab] = useState("modules");
  const ActiveComponent = TABS.find((t) => t.key === tab).component;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Project Estimator Pro</h1>
        <nav>
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        <ActiveComponent />
      </main>
    </div>
  );
}

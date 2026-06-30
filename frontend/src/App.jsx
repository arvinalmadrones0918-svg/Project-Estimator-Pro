import { useState } from "react";
import MaterialsPage from "./MaterialsPage";
import LaborPage from "./LaborPage";
import ModulesPage from "./ModulesPage";
import Dashboard from "./dashboard/Dashboard";
import ProjectWorkspace from "./workspace/ProjectWorkspace";
import CatalogPage from "./catalog/CatalogPage";
import SuppliersPage from "./procurement/SuppliersPage";
import ProcurementPage from "./procurement/ProcurementPage";
import UpaPage from "./upa/UpaPage";
import ReportsPage from "./reports/ReportsPage";
import TenderingPage from "./tendering/TenderingPage";
import GeneralRequirementsPage from "./gr/GeneralRequirementsPage";
import GlobalSearch from "./tendering/GlobalSearch";
import { catalogApis } from "./catalog/catalogApi";
import { useTheme } from "./hooks/useTheme";

// Catalog tab definitions — each reuses the same CatalogPage component
// with different API/field/label config.
const CATALOG_TABS = [
  {
    key: "cat-materials",
    label: "Materials",
    component: () => (
      <CatalogPage
        title="Materials Catalog"
        api={catalogApis.materials}
        priceField="unitPrice"
        priceLabel="Unit Cost"
        hasUnit
      />
    ),
  },
  {
    key: "cat-labor",
    label: "Labor",
    component: () => (
      <CatalogPage
        title="Labor Specializations"
        api={catalogApis.labor}
        priceField="hourlyRate"
        priceLabel="Hourly Rate"
        hasUnit={false}
      />
    ),
  },
  {
    key: "cat-equipment",
    label: "Equipment",
    component: () => (
      <CatalogPage
        title="Equipment Catalog"
        api={catalogApis.equipment}
        priceField="unitPrice"
        priceLabel="Unit Cost"
        hasUnit
      />
    ),
  },
  {
    key: "cat-subcontract",
    label: "Subcontract",
    component: () => (
      <CatalogPage
        title="Subcontract Catalog"
        api={catalogApis.subcontract}
        priceField="unitPrice"
        priceLabel="Unit Cost"
        hasUnit
      />
    ),
  },
  {
    key: "cat-other",
    label: "Other Costs",
    component: () => (
      <CatalogPage
        title="Other Costs Catalog"
        api={catalogApis["other-costs"]}
        priceField="unitPrice"
        priceLabel="Unit Cost"
        hasUnit
      />
    ),
  },
];

const TABS = [
  { key: "dashboard", label: "Projects" },
  ...CATALOG_TABS,
  { key: "rate-analysis", label: "Rate Analysis", component: UpaPage },
  { key: "general-requirements", label: "General Requirements", component: GeneralRequirementsPage },
  { key: "reports", label: "Reports", component: ReportsPage },
  { key: "suppliers", label: "Suppliers", component: SuppliersPage },
  { key: "procurement", label: "Procurement", component: ProcurementPage },
  { key: "tendering", label: "Tendering", component: TenderingPage },
  { key: "modules", label: "Work Modules", component: ModulesPage },
  { key: "materials-legacy", label: "Mat DB (legacy)", component: MaterialsPage },
  { key: "labor-legacy", label: "Labor DB (legacy)", component: LaborPage },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [openProjectId, setOpenProjectId] = useState(null);
  const [showAllTabs, setShowAllTabs] = useState(false);
  const { theme, toggleTheme } = useTheme();

  function handleOpenProject(id) { setOpenProjectId(id); }
  function handleBackToDashboard() { setOpenProjectId(null); setTab("dashboard"); }
  function handleTabChange(key) { setOpenProjectId(null); setTab(key); }

  // Primary tabs always visible; legacy tabs hidden behind a toggle
  const primaryTabs = TABS.filter((t) => !t.key.includes("legacy"));
  const legacyTabs = TABS.filter((t) => t.key.includes("legacy"));
  const visibleTabs = showAllTabs ? TABS : primaryTabs;

  const activeTab = TABS.find((t) => t.key === tab);
  const ActiveComponent = activeTab?.component;

  const isFullScreen = tab === "dashboard" && openProjectId;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Project Estimator Pro</h1>
        <GlobalSearch />
        <nav>
          {visibleTabs.map((t) => (
            <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => handleTabChange(t.key)}>
              {t.label}
            </button>
          ))}
          {legacyTabs.length > 0 && (
            <button
              className="theme-toggle"
              onClick={() => setShowAllTabs((v) => !v)}
              title="Show/hide legacy pages"
              style={{ fontSize: "0.75rem", opacity: 0.7 }}
            >
              {showAllTabs ? "▾" : "▸"} More
            </button>
          )}
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle dark/light theme">
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </nav>
      </header>
      <main className={isFullScreen ? "main-full" : ""}>
        {tab === "dashboard" ? (
          openProjectId ? (
            <ProjectWorkspace projectId={openProjectId} onBack={handleBackToDashboard} />
          ) : (
            <Dashboard onOpenProject={handleOpenProject} />
          )
        ) : (
          ActiveComponent && <ActiveComponent />
        )}
      </main>
    </div>
  );
}

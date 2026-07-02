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
import ExcelPage from "./excel/ExcelPage";
import CostControlPage from "./costcontrol/CostControlPage";
import ExecutiveDashboard from "./analytics/ExecutiveDashboard";
import GlobalSearch from "./tendering/GlobalSearch";
import AdminPage from "./auth/AdminPage";
import MyWorkPage from "./auth/MyWorkPage";
import LoginPage from "./auth/LoginPage";
import UserMenu from "./auth/UserMenu";
import NavDropdown from "./components/NavDropdown";
import { useAuth } from "./auth/AuthContext";
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

// Component registry — the single source of truth for routing. Every navigable
// page keeps its exact key/component (routes are unchanged). The visual grouping
// into top-level buttons and dropdowns is defined separately in NAV_GROUPS.
const TABS = [
  { key: "executive", label: "Executive" },
  { key: "mywork", label: "My Work" },
  { key: "dashboard", label: "Projects" },
  ...CATALOG_TABS,
  { key: "rate-analysis", label: "Rate Analysis", component: UpaPage },
  { key: "general-requirements", label: "General Requirements", component: GeneralRequirementsPage },
  { key: "modules", label: "Work Modules", component: ModulesPage },
  { key: "suppliers", label: "Suppliers", component: SuppliersPage },
  { key: "procurement", label: "Procurement", component: ProcurementPage },
  { key: "tendering", label: "Tendering", component: TenderingPage },
  { key: "cost-control", label: "Cost Control", component: CostControlPage },
  { key: "reports", label: "Reports", component: ReportsPage },
  { key: "excel", label: "Excel", component: ExcelPage },
  { key: "materials-legacy", label: "Materials DB (legacy)", component: MaterialsPage },
  { key: "labor-legacy", label: "Labor DB (legacy)", component: LaborPage },
];

// Top-level buttons shown directly in the navigation bar.
const TOP_LEVEL = ["executive", "mywork", "dashboard"];

// Grouped dropdown menus (enterprise-style navigation). Each group lists the
// tab keys it exposes — the pages/routes behind them are unchanged.
const NAV_GROUPS = [
  { label: "Master Catalogs", keys: ["cat-materials", "cat-labor", "cat-equipment", "cat-subcontract", "cat-other"] },
  { label: "Estimating", keys: ["rate-analysis", "general-requirements", "modules"] },
  { label: "Procurement", keys: ["suppliers", "procurement", "tendering"] },
  { label: "Project Controls", keys: ["cost-control", "reports", "excel"] },
  { label: "Legacy", keys: ["materials-legacy", "labor-legacy"] },
];

export default function App() {
  const [tab, setTab] = useState("executive");
  const [openProjectId, setOpenProjectId] = useState(null);
  const { theme, toggleTheme } = useTheme();
  const { user, loading, can, isAdmin } = useAuth();

  function handleOpenProject(id) { setOpenProjectId(id); setTab("dashboard"); }
  function handleBackToDashboard() { setOpenProjectId(null); setTab("dashboard"); }
  function handleTabChange(key) { setOpenProjectId(null); setTab(key); }

  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <LoginPage />;

  // Admin tab only for users with Administration access.
  const adminTabs = isAdmin ? [{ key: "admin", label: "Administration", component: AdminPage }] : [];
  const allTabs = [...TABS, ...adminTabs];
  const labelFor = (key) => allTabs.find((t) => t.key === key)?.label ?? key;
  const topLevelTabs = TOP_LEVEL.map((key) => allTabs.find((t) => t.key === key)).filter(Boolean);

  const activeTab = allTabs.find((t) => t.key === tab);
  const ActiveComponent = activeTab?.component;

  const isFullScreen = tab === "dashboard" && openProjectId;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Project Estimator Pro</h1>
        <GlobalSearch />
        <nav>
          {topLevelTabs.map((t) => (
            <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => handleTabChange(t.key)}>
              {t.label}
            </button>
          ))}

          {NAV_GROUPS.map((group) => (
            <NavDropdown
              key={group.label}
              label={group.label}
              items={group.keys.map((key) => ({ key, label: labelFor(key) }))}
              activeKey={tab}
              onSelect={handleTabChange}
            />
          ))}

          {isAdmin && (
            <button className={tab === "admin" ? "active" : ""} onClick={() => handleTabChange("admin")}>
              Administration
            </button>
          )}

          <button className="theme-toggle" onClick={toggleTheme} title="Toggle dark/light theme">
            {theme === "light" ? "🌙" : "☀️"}
          </button>
          <UserMenu />
        </nav>
      </header>
      <main className={isFullScreen ? "main-full" : ""}>
        {tab === "executive" ? (
          <ExecutiveDashboard onOpenProject={handleOpenProject} />
        ) : tab === "mywork" ? (
          <MyWorkPage onOpenProject={handleOpenProject} />
        ) : tab === "dashboard" ? (
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

import { useState } from "react";
import MaterialsPage from "./MaterialsPage";
import LaborPage from "./LaborPage";
import ModulesPage from "./ModulesPage";
import Dashboard from "./dashboard/Dashboard";
import ProjectWorkspace from "./workspace/ProjectWorkspace";
import { useTheme } from "./hooks/useTheme";

const TABS = [
  { key: "dashboard", label: "Projects" },
  { key: "modules", label: "Work Modules", component: ModulesPage },
  { key: "materials", label: "Materials Database", component: MaterialsPage },
  { key: "labor", label: "Labor Specializations", component: LaborPage },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [openProjectId, setOpenProjectId] = useState(null);
  const { theme, toggleTheme } = useTheme();

  function handleOpenProject(id) {
    setOpenProjectId(id);
  }

  function handleBackToDashboard() {
    setOpenProjectId(null);
    setTab("dashboard");
  }

  function handleTabChange(key) {
    setOpenProjectId(null);
    setTab(key);
  }

  const activeTab = TABS.find((t) => t.key === tab);
  const ActiveComponent = activeTab?.component;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Project Estimator Pro</h1>
        <nav>
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => handleTabChange(t.key)}>
              {t.label}
            </button>
          ))}
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle dark/light theme">
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </nav>
      </header>
      <main className={tab === "dashboard" && openProjectId ? "main-full" : ""}>
        {tab === "dashboard" ? (
          openProjectId ? (
            <ProjectWorkspace projectId={openProjectId} onBack={handleBackToDashboard} />
          ) : (
            <Dashboard onOpenProject={handleOpenProject} />
          )
        ) : (
          <ActiveComponent />
        )}
      </main>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import WbsTree from "./WbsTree";
import NodeEditor from "./NodeEditor";
import ProjectInfoPanel from "./ProjectInfoPanel";
import CostSummaryPanel from "./CostSummaryPanel";
import BottomSummaryBar from "./BottomSummaryBar";

const LEFT_NAV = [
  { key: "wbs", label: "Work Breakdown Structure" },
  { key: "info", label: "Project Information" },
  { key: "costSummary", label: "Cost Summary" },
  { key: "reports", label: "Reports" },
];

function emptyTotals() {
  return {
    materialCost: 0,
    laborCost: 0,
    equipmentCost: 0,
    subcontractCost: 0,
    otherCost: 0,
    assemblyCost: 0,
    directCost: 0,
    projectTotal: 0,
  };
}

export default function ProjectWorkspace({ projectId, onBack }) {
  const [project, setProject] = useState(null);
  const [categories, setCategories] = useState([]);
  const [modules, setModules] = useState([]);
  const [catalogs, setCatalogs] = useState({ materials: [], laborSpecializations: [], equipment: [], assemblies: [] });
  const [leftNav, setLeftNav] = useState("wbs");
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function loadAll() {
    setLoading(true);
    Promise.all([
      api.projects.get(projectId),
      api.wbs.categories(),
      api.modules.list({ projectId }),
      api.materials.list(),
      api.laborSpecializations.list(),
      api.equipment.list(),
      api.assemblies.list(),
    ])
      .then(([proj, cats, mods, materials, laborSpecializations, equipment, assemblies]) => {
        setProject(proj);
        setCategories(cats);
        setModules(mods);
        setCatalogs({ materials, laborSpecializations, equipment, assemblies });
        if (mods.length > 0 && !selectedModuleId) setSelectedModuleId(mods[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, [projectId]);

  // Alt+1..4 jump between the left-nav sections without touching the mouse.
  useEffect(() => {
    function onKeyDown(e) {
      if (!e.altKey) return;
      const index = Number(e.key) - 1;
      if (index >= 0 && index < LEFT_NAV.length) {
        e.preventDefault();
        setLeftNav(LEFT_NAV[index].key);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function refreshModules() {
    api.modules.list({ projectId }).then(setModules).catch((e) => setError(e.message));
  }

  async function handleAddModule(wbsCategoryId, wbsSubcategoryId) {
    const name = window.prompt("Name this work item:");
    if (!name) return;
    try {
      const created = await api.modules.create({ name, projectId, wbsCategoryId, wbsSubcategoryId });
      refreshModules();
      setSelectedModuleId(created.id);
      setLeftNav("wbs");
    } catch (err) {
      setError(err.message);
    }
  }

  const totals = useMemo(() => {
    const totalsObj = modules.reduce((acc, m) => {
      acc.materialCost += m.materialCost;
      acc.laborCost += m.laborCost;
      acc.equipmentCost += m.equipmentCost;
      acc.subcontractCost += m.subcontractCost;
      acc.otherCost += m.otherCost;
      acc.assemblyCost += m.assemblyCost;
      return acc;
    }, emptyTotals());
    totalsObj.directCost =
      totalsObj.materialCost +
      totalsObj.laborCost +
      totalsObj.equipmentCost +
      totalsObj.subcontractCost +
      totalsObj.otherCost +
      totalsObj.assemblyCost;
    totalsObj.projectTotal = totalsObj.directCost;
    return totalsObj;
  }, [modules]);

  if (loading) return <Spinner label="Loading project workspace…" />;
  if (!project) return <ErrorBanner message={error || "Project not found."} />;

  return (
    <div className="workspace">
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="workspace-header">
        <button className="link-button" onClick={onBack}>
          ← Back to Dashboard
        </button>
        <h2>{project.name}</h2>
      </div>

      <div className="workspace-body">
        <nav className="workspace-sidebar">
          {LEFT_NAV.map((item) => (
            <button
              key={item.key}
              className={leftNav === item.key ? "active" : ""}
              onClick={() => setLeftNav(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {leftNav === "wbs" && (
          <>
            <div className="workspace-center">
              <WbsTree
                categories={categories}
                modules={modules}
                selectedModuleId={selectedModuleId}
                onSelectModule={setSelectedModuleId}
                onAddModule={handleAddModule}
              />
            </div>
            <div className="workspace-right">
              {selectedModuleId ? (
                <NodeEditor
                  moduleId={selectedModuleId}
                  catalogs={catalogs}
                  onChange={refreshModules}
                  setError={setError}
                />
              ) : (
                <p className="empty-state">Select a work item from the tree, or add one with "+ Add".</p>
              )}
            </div>
          </>
        )}

        {leftNav === "info" && (
          <div className="workspace-full">
            <ProjectInfoPanel project={project} onSaved={setProject} setError={setError} />
          </div>
        )}

        {leftNav === "costSummary" && (
          <div className="workspace-full">
            <CostSummaryPanel totals={totals} />
          </div>
        )}

        {leftNav === "reports" && (
          <div className="workspace-full">
            <p className="empty-state">Reports are coming in a future phase.</p>
          </div>
        )}
      </div>

      <BottomSummaryBar totals={totals} />
    </div>
  );
}

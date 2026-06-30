import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import WbsTree from "./WbsTree";
import NodeEditor from "./NodeEditor";
import ProjectInfoPanel from "./ProjectInfoPanel";
import CostEnginePanel from "./CostEnginePanel";
import BottomSummaryBar from "./BottomSummaryBar";
import WorkflowBar from "../auth/WorkflowBar";

const LEFT_NAV = [
  { key: "wbs", label: "Work Breakdown Structure" },
  { key: "info", label: "Project Information" },
  { key: "costSummary", label: "Cost Summary" },
  { key: "reports", label: "Reports" },
];

export default function ProjectWorkspace({ projectId, onBack }) {
  const [project, setProject] = useState(null);
  const [categories, setCategories] = useState([]);
  const [modules, setModules] = useState([]);
  const [catalogs, setCatalogs] = useState({ materials: [], laborSpecializations: [], equipment: [], assemblies: [] });
  const [leftNav, setLeftNav] = useState("wbs");
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Phase 5: all totals come from the cost engine (single source of truth).
  const [calc, setCalc] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [activeScenarioId, setActiveScenarioId] = useState(null);

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
      api.estimate.scenarios(projectId),
    ])
      .then(([proj, cats, mods, materials, laborSpecializations, equipment, assemblies, scens]) => {
        setProject(proj);
        setCategories(cats);
        setModules(mods);
        setCatalogs({ materials, laborSpecializations, equipment, assemblies });
        setScenarios(scens);
        const primary = scens.find((s) => s.isPrimary) ?? null;
        setActiveScenarioId(primary ? primary.id : null);
        if (mods.length > 0 && !selectedModuleId) setSelectedModuleId(mods[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, [projectId]);

  // Recalculate via the engine whenever the scenario changes or a mutation
  // signals a change. Only the affected modules recompute server-side.
  const recalc = useCallback(() => {
    api.estimate.calculateProject(projectId, { scenarioId: activeScenarioId })
      .then(setCalc)
      .catch((e) => setError(e.message));
  }, [projectId, activeScenarioId]);

  useEffect(recalc, [recalc]);

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
    recalc();
  }

  function refreshScenarios(selectId) {
    api.estimate.scenarios(projectId).then((scens) => {
      setScenarios(scens);
      if (selectId !== undefined) setActiveScenarioId(selectId);
    });
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

  if (loading) return <Spinner label="Loading project workspace…" />;
  if (!project) return <ErrorBanner message={error || "Project not found."} />;

  // Bottom-bar totals derived from the engine result.
  const w = calc?.waterfall;
  const b = calc?.directCostBreakdown;
  const totals = {
    materialCost: b?.materialCost ?? 0,
    laborCost: b?.laborCost ?? 0,
    equipmentCost: b?.equipmentCost ?? 0,
    subcontractCost: b?.subcontractCost ?? 0,
    otherCost: b?.otherCost ?? 0,
    directCost: w?.directCost ?? 0,
    finalTenderPrice: w?.finalTenderPrice ?? 0,
    projectTotal: w?.finalTenderPrice ?? w?.directCost ?? 0,
  };

  return (
    <div className="workspace">
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="workspace-header">
        <button className="link-button" onClick={onBack}>
          ← Back to Dashboard
        </button>
        <h2>{project.name}</h2>
        <WorkflowBar
          projectId={projectId}
          workflowStatus={project.workflowStatus}
          onChanged={(ws) => setProject((p) => ({ ...p, workflowStatus: ws }))}
        />
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
            <CostEnginePanel
              projectId={projectId}
              calc={calc}
              scenarios={scenarios}
              activeScenarioId={activeScenarioId}
              onScenarioChange={setActiveScenarioId}
              onScenariosChanged={refreshScenarios}
              onRecalc={recalc}
              setError={setError}
            />
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

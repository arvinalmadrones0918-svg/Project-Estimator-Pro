import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { setActiveCurrency } from "../utils";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import ConfirmDialog from "../components/ConfirmDialog";
import ProjectExplorer from "./ProjectExplorer";
import NodeEditor from "./NodeEditor";
import ProjectInfoPanel from "./ProjectInfoPanel";
import CostEnginePanel from "./CostEnginePanel";
import CostSummarySidebar from "./CostSummarySidebar";
import BottomSummaryBar from "./BottomSummaryBar";
import WorkflowBar from "../auth/WorkflowBar";
import ReportsPage from "../reports/ReportsPage";
import ProcurementWorkspace from "../procurement/ProcurementWorkspace";
import CostControlWorkspace from "../costcontrol/CostControlWorkspace";
import EstimateWorksheet from "./EstimateWorksheet";
import BillOfQuantities from "./BillOfQuantities";

export default function ProjectWorkspace({ projectId, onBack }) {
  const [project, setProject] = useState(null);
  const [categories, setCategories] = useState([]);
  const [modules, setModules] = useState([]);
  const [catalogs, setCatalogs] = useState({ materials: [], laborSpecializations: [], equipment: [], assemblies: [] });
  // Unified selection: { type: "info"|"module"|"costSummary"|"reports", moduleId? }
  const [selection, setSelection] = useState({ type: "info" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // All totals come from the cost engine (single source of truth).
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
        if (mods.length > 0) setSelection((s) => (s.type === "info" ? { type: "module", moduleId: mods[0].id } : s));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, [projectId]);

  // The project's Currency field drives money formatting across the workspace.
  useEffect(() => {
    if (project?.currency) setActiveCurrency(project.currency);
  }, [project?.currency]);

  const recalc = useCallback(() => {
    api.estimate.calculateProject(projectId, { scenarioId: activeScenarioId })
      .then(setCalc)
      .catch((e) => setError(e.message));
  }, [projectId, activeScenarioId]);

  useEffect(recalc, [recalc]);

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

  // ── Explorer node actions ──────────────────────────────────────────────────
  async function handleAddModule(wbsCategoryId, wbsSubcategoryId) {
    const name = window.prompt("Name this work item:");
    if (!name) return;
    try {
      const created = await api.modules.create({ name, projectId, wbsCategoryId, wbsSubcategoryId });
      refreshModules();
      setSelection({ type: "module", moduleId: created.id });
    } catch (err) { setError(err.message); }
  }

  async function handleRenameModule(m) {
    const name = window.prompt("Rename work item:", m.name);
    if (!name || name === m.name) return;
    try { await api.modules.update(m.id, { name }); refreshModules(); }
    catch (err) { setError(err.message); }
  }

  async function handleDuplicateModule(m) {
    try { const dup = await api.modules.duplicate(m.id); refreshModules(); setSelection({ type: "module", moduleId: dup.id }); }
    catch (err) { setError(err.message); }
  }

  async function handleDeleteModule(m) {
    try {
      await api.modules.remove(m.id);
      setConfirmDelete(null);
      if (selection.moduleId === m.id) setSelection({ type: "info" });
      refreshModules();
    } catch (err) { setError(err.message); }
  }

  async function handleMoveModule(moduleId, wbsCategoryId, wbsSubcategoryId) {
    try { await api.modules.update(moduleId, { wbsCategoryId, wbsSubcategoryId }); refreshModules(); }
    catch (err) { setError(err.message); }
  }

  if (loading) return <Spinner label="Loading project workspace…" />;
  if (!project) return <ErrorBanner message={error || "Project not found."} />;

  const w = calc?.waterfall;
  const b = calc?.directCostBreakdown;
  const totals = {
    materialCost: b?.materialCost ?? 0, laborCost: b?.laborCost ?? 0,
    equipmentCost: b?.equipmentCost ?? 0, subcontractCost: b?.subcontractCost ?? 0,
    otherCost: b?.otherCost ?? 0, directCost: w?.directCost ?? 0,
    finalTenderPrice: w?.finalTenderPrice ?? 0, projectTotal: w?.finalTenderPrice ?? w?.directCost ?? 0,
  };

  return (
    <div className="workspace">
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="workspace-header sticky-toolbar">
        <button className="link-button" onClick={onBack}>← Back to Dashboard</button>
        <button className="link-button" onClick={() => setExplorerCollapsed((v) => !v)} title="Toggle explorer">
          {explorerCollapsed ? "☰" : "◀"}
        </button>
        <h2>{project.name}</h2>
        <WorkflowBar projectId={projectId} workflowStatus={project.workflowStatus}
          onChanged={(ws) => setProject((p) => ({ ...p, workflowStatus: ws }))} />
      </div>

      <div className="workspace-body pro">
        {!explorerCollapsed && (
          <div className="workspace-explorer">
            <ProjectExplorer
              project={project} categories={categories} modules={modules}
              selection={selection} onSelect={setSelection}
              onAddModule={handleAddModule}
              onRenameModule={handleRenameModule}
              onDuplicateModule={handleDuplicateModule}
              onDeleteModule={(m) => setConfirmDelete(m)}
              onMoveModule={handleMoveModule}
            />
          </div>
        )}

        <div className="workspace-main">
          {selection.type === "module" && selection.moduleId ? (
            <NodeEditor moduleId={selection.moduleId} catalogs={catalogs} onChange={refreshModules} setError={setError} />
          ) : selection.type === "info" ? (
            <ProjectInfoPanel project={project} onSaved={setProject} setError={setError} />
          ) : selection.type === "costSummary" ? (
            <CostEnginePanel
              projectId={projectId} calc={calc} scenarios={scenarios} activeScenarioId={activeScenarioId}
              onScenarioChange={setActiveScenarioId} onScenariosChanged={refreshScenarios}
              onRecalc={recalc} setError={setError}
            />
          ) : selection.type === "worksheet" ? (
            <EstimateWorksheet projectId={projectId} />
          ) : selection.type === "boq" ? (
            <BillOfQuantities projectId={projectId} />
          ) : selection.type === "costControl" ? (
            <CostControlWorkspace projectId={projectId} />
          ) : selection.type === "procurement" ? (
            <ProcurementWorkspace projectId={projectId} />
          ) : selection.type === "reports" ? (
            <ReportsPage initialProjectId={projectId} />
          ) : (
            <p className="empty-state">Select a node from the Project Explorer.</p>
          )}
        </div>

        <CostSummarySidebar calc={calc} collapsed={summaryCollapsed} onToggle={() => setSummaryCollapsed((v) => !v)} />
      </div>

      <BottomSummaryBar totals={totals} />

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Work Item"
          message={`Delete "${confirmDelete.name}"? Its line items are archived with it.`}
          confirmLabel="Delete" danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDeleteModule(confirmDelete)}
        />
      )}
    </div>
  );
}

const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function qs(params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}

export const api = {
  projects: {
    list: (params) => request(`/projects${qs(params)}`),
    get: (id) => request(`/projects/${id}`),
    create: (data) => request("/projects", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/projects/${id}`, { method: "DELETE" }),
    archive: (id) => request(`/projects/${id}/archive`, { method: "PUT" }),
    restore: (id) => request(`/projects/${id}/restore`, { method: "PUT" }),
    duplicate: (id) => request(`/projects/${id}/duplicate`, { method: "POST" }),
  },
  wbs: {
    categories: () => request("/wbs/categories"),
    createCategory: (data) => request("/wbs/categories", { method: "POST", body: JSON.stringify(data) }),
    createSubcategory: (categoryId, data) =>
      request(`/wbs/categories/${categoryId}/subcategories`, { method: "POST", body: JSON.stringify(data) }),
    removeCategory: (id) => request(`/wbs/categories/${id}`, { method: "DELETE" }),
    removeSubcategory: (id) => request(`/wbs/subcategories/${id}`, { method: "DELETE" }),
  },
  materials: {
    list: () => request("/materials"),
    create: (data) => request("/materials", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/materials/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/materials/${id}`, { method: "DELETE" }),
  },
  laborSpecializations: {
    list: () => request("/labor-specializations"),
    create: (data) => request("/labor-specializations", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/labor-specializations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/labor-specializations/${id}`, { method: "DELETE" }),
  },
  equipment: {
    list: () => request("/equipment"),
    create: (data) => request("/equipment", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/equipment/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/equipment/${id}`, { method: "DELETE" }),
  },
  assemblies: {
    list: () => request("/assemblies"),
    get: (id) => request(`/assemblies/${id}`),
    create: (data) => request("/assemblies", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/assemblies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/assemblies/${id}`, { method: "DELETE" }),
  },
  modules: {
    list: (params) => request(`/modules${qs(params)}`),
    get: (id) => request(`/modules/${id}`),
    create: (data) => request("/modules", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/modules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/modules/${id}`, { method: "DELETE" }),

    addMaterial: (id, data) => request(`/modules/${id}/materials`, { method: "POST", body: JSON.stringify(data) }),
    updateMaterial: (id, lineId, data) =>
      request(`/modules/${id}/materials/${lineId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeMaterial: (id, lineId) => request(`/modules/${id}/materials/${lineId}`, { method: "DELETE" }),

    addLabor: (id, data) => request(`/modules/${id}/labor`, { method: "POST", body: JSON.stringify(data) }),
    updateLabor: (id, lineId, data) =>
      request(`/modules/${id}/labor/${lineId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeLabor: (id, lineId) => request(`/modules/${id}/labor/${lineId}`, { method: "DELETE" }),

    addEquipment: (id, data) => request(`/modules/${id}/equipment`, { method: "POST", body: JSON.stringify(data) }),
    updateEquipment: (id, lineId, data) =>
      request(`/modules/${id}/equipment/${lineId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeEquipment: (id, lineId) => request(`/modules/${id}/equipment/${lineId}`, { method: "DELETE" }),

    addSubcontract: (id, data) => request(`/modules/${id}/subcontract`, { method: "POST", body: JSON.stringify(data) }),
    updateSubcontract: (id, lineId, data) =>
      request(`/modules/${id}/subcontract/${lineId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeSubcontract: (id, lineId) => request(`/modules/${id}/subcontract/${lineId}`, { method: "DELETE" }),

    addOtherCost: (id, data) => request(`/modules/${id}/other-costs`, { method: "POST", body: JSON.stringify(data) }),
    updateOtherCost: (id, lineId, data) =>
      request(`/modules/${id}/other-costs/${lineId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeOtherCost: (id, lineId) => request(`/modules/${id}/other-costs/${lineId}`, { method: "DELETE" }),

    addAssembly: (id, data) => request(`/modules/${id}/assemblies`, { method: "POST", body: JSON.stringify(data) }),
    updateAssembly: (id, lineId, data) =>
      request(`/modules/${id}/assemblies/${lineId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeAssembly: (id, lineId) => request(`/modules/${id}/assemblies/${lineId}`, { method: "DELETE" }),

    sortLines: (id, lineType, items) =>
      request(`/modules/${id}/lines/sort`, { method: "PATCH", body: JSON.stringify({ lineType, items }) }),
  },
  estimate: {
    // Calculation (engine = single source of truth)
    calculateProject: (projectId, params) => request(`/estimate/project/${projectId}/calculate${qs(params)}`),
    calculateModule: (moduleId) => request(`/estimate/module/${moduleId}/calculate`),
    calculateAssembly: (assemblyId) => request(`/estimate/assembly/${assemblyId}/calculate`),

    // Scenarios
    scenarios: (projectId) => request(`/estimate/scenarios${qs({ projectId })}`),
    createScenario: (data) => request("/estimate/scenarios", { method: "POST", body: JSON.stringify(data) }),
    updateScenario: (id, data) => request(`/estimate/scenarios/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    removeScenario: (id) => request(`/estimate/scenarios/${id}`, { method: "DELETE" }),
    duplicateScenario: (id) => request(`/estimate/scenarios/${id}/duplicate`, { method: "POST" }),

    // Indirect costs
    indirectCosts: (projectId, scenarioId) => request(`/estimate/indirect-costs${qs({ projectId, scenarioId })}`),
    createIndirect: (data) => request("/estimate/indirect-costs", { method: "POST", body: JSON.stringify(data) }),
    updateIndirect: (id, data) => request(`/estimate/indirect-costs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    removeIndirect: (id) => request(`/estimate/indirect-costs/${id}`, { method: "DELETE" }),
    seedDefaultIndirect: (data) => request("/estimate/indirect-costs/seed-defaults", { method: "POST", body: JSON.stringify(data) }),

    // Revisions & audit
    revisions: (projectId, scenarioId) => request(`/estimate/revisions${qs({ projectId, scenarioId })}`),
    revision: (id) => request(`/estimate/revisions/${id}`),
    createRevision: (data) => request("/estimate/revisions", { method: "POST", body: JSON.stringify(data) }),
    audit: (projectId, limit) => request(`/estimate/audit${qs({ projectId, limit })}`),
  },
};

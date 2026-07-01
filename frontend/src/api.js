const BASE = "/api";

// Auth token storage + an optional handler invoked on 401 (session expiry).
let authToken = localStorage.getItem("pe_token") || null;
let onUnauthorized = null;
export function setAuthToken(token) {
  authToken = token;
  if (token) localStorage.setItem("pe_token", token);
  else localStorage.removeItem("pe_token");
}
export function getAuthToken() { return authToken; }
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401 && onUnauthorized && !path.startsWith("/auth/")) onUnauthorized();
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
    duplicate: (id) => request(`/modules/${id}/duplicate`, { method: "POST" }),

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

    addUPA: (id, data) => request(`/modules/${id}/upa`, { method: "POST", body: JSON.stringify(data) }),
    updateUPA: (id, lineId, data) => request(`/modules/${id}/upa/${lineId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeUPA: (id, lineId) => request(`/modules/${id}/upa/${lineId}`, { method: "DELETE" }),
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
  suppliers: {
    list: (params) => request(`/suppliers${qs(params)}`),
    filters: () => request("/suppliers/filters"),
    get: (id) => request(`/suppliers/${id}`),
    create: (data) => request("/suppliers", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/suppliers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    duplicate: (id) => request(`/suppliers/${id}/duplicate`, { method: "POST" }),
    deactivate: (id) => request(`/suppliers/${id}/deactivate`, { method: "PUT" }),
    activate: (id) => request(`/suppliers/${id}/activate`, { method: "PUT" }),
    remove: (id) => request(`/suppliers/${id}`, { method: "DELETE" }),
    restore: (id) => request(`/suppliers/${id}/restore`, { method: "PUT" }),
  },
  procurement: {
    dashboard: () => request("/procurement/dashboard"),
    comparisonTable: () => request("/procurement/comparison-table"),
    quotations: (materialId) => request(`/procurement/quotations${qs({ materialId })}`),
    createQuotation: (data) => request("/procurement/quotations", { method: "POST", body: JSON.stringify(data) }),
    updateQuotation: (id, data) => request(`/procurement/quotations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    removeQuotation: (id) => request(`/procurement/quotations/${id}`, { method: "DELETE" }),
    comparison: (materialId) => request(`/procurement/comparison/${materialId}`),
    select: (data) => request("/procurement/select", { method: "POST", body: JSON.stringify(data) }),
    packages: (groupBy) => request(`/procurement/packages${qs({ groupBy })}`),
    rfq: (params) => request(`/procurement/rfq${qs(params)}`),
    audit: (materialId, limit) => request(`/procurement/audit${qs({ materialId, limit })}`),
  },
  // Phase 8: project-centric procurement workflow (RFQ → quotations → bid
  // comparison → award → PO, plus purchase requests, performance, attachments).
  purchasing: {
    dashboard: (projectId) => request(`/purchasing/dashboard${qs({ projectId })}`),
    estimateItems: (projectId) => request(`/purchasing/estimate-items/${projectId}`),
    rfqs: (projectId) => request(`/purchasing/rfqs${qs({ projectId })}`),
    rfq: (id) => request(`/purchasing/rfqs/${id}`),
    createRfq: (data) => request("/purchasing/rfqs", { method: "POST", body: JSON.stringify(data) }),
    setRfqStatus: (id, status) => request(`/purchasing/rfqs/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    removeRfq: (id) => request(`/purchasing/rfqs/${id}`, { method: "DELETE" }),
    addRfqSupplier: (id, supplierId) => request(`/purchasing/rfqs/${id}/suppliers`, { method: "POST", body: JSON.stringify({ supplierId }) }),
    quotations: (rfqId) => request(`/purchasing/rfqs/${rfqId}/quotations`),
    createQuotation: (rfqId, data) => request(`/purchasing/rfqs/${rfqId}/quotations`, { method: "POST", body: JSON.stringify(data) }),
    removeQuotation: (id) => request(`/purchasing/quotations/${id}`, { method: "DELETE" }),
    bidComparison: (rfqId) => request(`/purchasing/rfqs/${rfqId}/bid-comparison`),
    award: (quotationId) => request(`/purchasing/quotations/${quotationId}/award`, { method: "POST" }),
    purchaseRequests: (projectId) => request(`/purchasing/purchase-requests${qs({ projectId })}`),
    purchaseRequest: (id) => request(`/purchasing/purchase-requests/${id}`),
    createPurchaseRequest: (data) => request("/purchasing/purchase-requests", { method: "POST", body: JSON.stringify(data) }),
    setPrStatus: (id, status) => request(`/purchasing/purchase-requests/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    removePurchaseRequest: (id) => request(`/purchasing/purchase-requests/${id}`, { method: "DELETE" }),
    purchaseOrders: (projectId) => request(`/purchasing/purchase-orders${qs({ projectId })}`),
    poFromQuotation: (quotationId) => request(`/purchasing/purchase-orders/from-quotation/${quotationId}`, { method: "POST" }),
    setPoStatus: (id, status) => request(`/purchasing/purchase-orders/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    performance: (supplierId) => request(`/purchasing/supplier-performance${qs({ supplierId })}`),
    scorecard: () => request("/purchasing/supplier-performance/scorecard"),
    addPerformance: (data) => request("/purchasing/supplier-performance", { method: "POST", body: JSON.stringify(data) }),
    attachments: (entityType, entityId) => request(`/purchasing/attachments${qs({ entityType, entityId })}`),
    addAttachment: (data) => request("/purchasing/attachments", { method: "POST", body: JSON.stringify(data) }),
    removeAttachment: (id) => request(`/purchasing/attachments/${id}`, { method: "DELETE" }),
  },
  upa: {
    list: (params) => request(`/upa${qs(params)}`),
    filters: () => request("/upa/filters"),
    get: (id) => request(`/upa/${id}`),
    calculate: (id) => request(`/upa/${id}/calculate`),
    create: (data) => request("/upa", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/upa/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    duplicate: (id) => request(`/upa/${id}/duplicate`, { method: "POST" }),
    remove: (id) => request(`/upa/${id}`, { method: "DELETE" }),
    addResource: (id, data) => request(`/upa/${id}/resources`, { method: "POST", body: JSON.stringify(data) }),
    updateResource: (id, resId, data) => request(`/upa/${id}/resources/${resId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeResource: (id, resId) => request(`/upa/${id}/resources/${resId}`, { method: "DELETE" }),
    sortResources: (id, items) => request(`/upa/${id}/resources/sort`, { method: "PATCH", body: JSON.stringify({ items }) }),
    versions: (id) => request(`/upa/${id}/versions`),
    version: (id, versionId) => request(`/upa/${id}/versions/${versionId}`),
    createVersion: (id, note) => request(`/upa/${id}/versions`, { method: "POST", body: JSON.stringify({ note }) }),
  },
  reports: {
    types: () => request("/reports/types"),
    generate: (reportType, params) => request(`/reports/generate/${reportType}${qs(params)}`),
    exportUrl: (reportType, params, format) => `/api/reports/export/${reportType}${qs({ ...params, format })}`,
    templates: () => request("/reports/templates"),
    saveTemplate: (data) => request("/reports/templates", { method: "POST", body: JSON.stringify(data) }),
    removeTemplate: (id) => request(`/reports/templates/${id}`, { method: "DELETE" }),
    history: (projectId) => request(`/reports/history${qs({ projectId })}`),
  },
};

// Generic CRUD client for a Phase 9 register table.
function makeRegister(path) {
  return {
    list: (params) => request(`/${path}${qs(params)}`),
    get: (id) => request(`/${path}/${id}`),
    create: (data) => request(`/${path}`, { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/${path}/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/${path}/${id}`, { method: "DELETE" }),
  };
}

api.clients = makeRegister("clients");
api.tenders = makeRegister("tenders");
api.drawings = makeRegister("drawings");
api.specifications = makeRegister("specifications");
api.addenda = makeRegister("addenda");
api.rfis = makeRegister("rfis");

api.documents = {
  list: (params) => request(`/documents${qs(params)}`),
  create: (data) => request("/documents", { method: "POST", body: JSON.stringify(data) }),
  addVersion: (id, data) => request(`/documents/${id}/versions`, { method: "POST", body: JSON.stringify(data) }),
  remove: (id) => request(`/documents/${id}`, { method: "DELETE" }),
  acceptedTypes: () => request("/documents/accepted-types"),
};

api.tendering = {
  changeLog: (params) => request(`/tendering/change-log${qs(params)}`),
  bidComparison: (projectId) => request(`/tendering/bid-comparison/${projectId}`),
  search: (q) => request(`/tendering/search${qs({ q })}`),
};

api.auth = {
  login: (data) => request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  changePassword: (data) => request("/auth/change-password", { method: "POST", body: JSON.stringify(data) }),
  forgotPassword: (username) => request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ username }) }),
  resetPassword: (data) => request("/auth/reset-password", { method: "POST", body: JSON.stringify(data) }),
  refresh: (refreshToken) => request("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }),
};

// Phase 10 (Enterprise): Organization — company, branches, departments,
// business units, currencies, tax settings.
api.organization = {
  company: () => request("/organization/company"),
  saveCompany: (data) => request("/organization/company", { method: "PUT", body: JSON.stringify(data) }),
  branches: () => request("/organization/branches"),
  departments: () => request("/organization/departments"),
  businessUnits: () => request("/organization/business-units"),
  currencies: () => request("/organization/currencies"),
  taxSettings: () => request("/organization/tax-settings"),
  create: (kind, data) => request(`/organization/${kind}`, { method: "POST", body: JSON.stringify(data) }),
  update: (kind, id, data) => request(`/organization/${kind}/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (kind, id) => request(`/organization/${kind}/${id}`, { method: "DELETE" }),
};

api.users = {
  list: () => request("/users"),
  create: (data) => request("/users", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) => request(`/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id) => request(`/users/${id}`, { method: "DELETE" }),
  roles: () => request("/users/roles"),
  createRole: (data) => request("/users/roles", { method: "POST", body: JSON.stringify(data) }),
  updateRole: (id, data) => request(`/users/roles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
};

api.enterprise = {
  transition: (projectId, transition, data) => request(`/enterprise/workflow/${projectId}/${transition}`, { method: "POST", body: JSON.stringify(data || {}) }),
  approvals: (projectId) => request(`/enterprise/workflow/${projectId}/approvals`),
  lockStatus: (projectId) => request(`/enterprise/locks/${projectId}`),
  acquireLock: (projectId) => request(`/enterprise/locks/${projectId}`, { method: "POST" }),
  releaseLock: (projectId) => request(`/enterprise/locks/${projectId}`, { method: "DELETE" }),
  forceUnlock: (projectId) => request(`/enterprise/locks/${projectId}/force`, { method: "POST" }),
  notifications: () => request("/enterprise/notifications"),
  markRead: (id) => request(`/enterprise/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => request("/enterprise/notifications/read-all", { method: "POST" }),
  dashboard: () => request("/enterprise/dashboard"),
  favorites: () => request("/enterprise/favorites"),
  addFavorite: (projectId) => request(`/enterprise/favorites/${projectId}`, { method: "POST" }),
  removeFavorite: (projectId) => request(`/enterprise/favorites/${projectId}`, { method: "DELETE" }),
  activity: (params) => request(`/enterprise/activity${qs(params)}`),
  loginHistory: () => request("/enterprise/activity/logins"),
  approvalHistory: () => request("/enterprise/activity/approvals"),
  audit: (params) => request(`/enterprise/audit${qs(params)}`),
  securityLogs: () => request("/enterprise/activity/security"),
  systemLogs: () => request("/enterprise/activity/system"),
};

api.analytics = {
  all: (filters) => request(`/analytics/all${qs(filters)}`),
  filters: () => request("/analytics/filters"),
  executive: (f) => request(`/analytics/executive${qs(f)}`),
};

api.purchaseOrders = makeRegister("purchase-orders");
api.subcontracts = makeRegister("subcontracts");
api.variationOrders = makeRegister("variation-orders");
api.progressBillings = makeRegister("progress-billings");
api.actualCosts = makeRegister("actual-costs");

api.costControl = {
  budgets: (projectId) => request(`/cost-control/budgets${qs({ projectId })}`),
  createBudget: (data) => request("/cost-control/budgets/from-estimate", { method: "POST", body: JSON.stringify(data) }),
  freezeBudget: (id) => request(`/cost-control/budgets/${id}/freeze`, { method: "POST" }),
  transfers: (projectId) => request(`/cost-control/transfers${qs({ projectId })}`),
  createTransfer: (data) => request("/cost-control/transfers", { method: "POST", body: JSON.stringify(data) }),
  actTransfer: (id, action) => request(`/cost-control/transfers/${id}/${action}`, { method: "POST" }),
  budgetVsActual: (projectId) => request(`/cost-control/budget-vs-actual/${projectId}`),
  committed: (projectId) => request(`/cost-control/committed/${projectId}`),
  earnedValue: (projectId) => request(`/cost-control/earned-value/${projectId}`),
  cashFlow: (projectId, months, granularity) => request(`/cost-control/cash-flow/${projectId}${qs({ months, granularity })}`),
  dashboard: (projectId) => request(`/cost-control/dashboard/${projectId}`),
  alerts: (projectId) => request(`/cost-control/alerts/${projectId}`),
};

api.excel = {
  entities: () => request("/excel/entities"),
  templateUrl: (entity) => `/api/excel/template/${entity}`,
  preview: (entity, rows, mapping) => request(`/excel/import/${entity}/preview`, { method: "POST", body: JSON.stringify({ rows, mapping }) }),
  commit: (entity, rows, mapping, option) => request(`/excel/import/${entity}/commit`, { method: "POST", body: JSON.stringify({ rows, mapping, option }) }),
  errorReportUrl: () => `/api/excel/error-report`,
  exports: () => request("/excel/exports"),
  summaryWorkbookUrl: (projectId) => `/api/excel/export/summary-workbook${qs({ projectId })}`,
};

const GR = "/general-requirements";
api.gr = {
  categories: () => request(`${GR}/categories`),
  staff: () => request(`${GR}/staff`),
  addStaff: (data) => request(`${GR}/staff`, { method: "POST", body: JSON.stringify(data) }),
  updateStaff: (id, data) => request(`${GR}/staff/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  removeStaff: (id) => request(`${GR}/staff/${id}`, { method: "DELETE" }),
  templates: () => request(`${GR}/templates`),
  template: (id) => request(`${GR}/templates/${id}`),
  sheets: (params) => request(`${GR}/sheets${qs(params)}`),
  sheet: (id) => request(`${GR}/sheets/${id}`),
  calculate: (id) => request(`${GR}/sheets/${id}/calculate`),
  createSheet: (data) => request(`${GR}/sheets`, { method: "POST", body: JSON.stringify(data) }),
  updateSheet: (id, data) => request(`${GR}/sheets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  removeSheet: (id) => request(`${GR}/sheets/${id}`, { method: "DELETE" }),
  duplicateSheet: (id) => request(`${GR}/sheets/${id}/duplicate`, { method: "POST" }),
  applyTemplate: (sheetId, templateId) => request(`${GR}/sheets/${sheetId}/apply-template/${templateId}`, { method: "POST" }),
  addItem: (sheetId, data) => request(`${GR}/sheets/${sheetId}/items`, { method: "POST", body: JSON.stringify(data) }),
  updateItem: (itemId, data) => request(`${GR}/items/${itemId}`, { method: "PUT", body: JSON.stringify(data) }),
  removeItem: (itemId) => request(`${GR}/items/${itemId}`, { method: "DELETE" }),
};

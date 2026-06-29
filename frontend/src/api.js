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

export const api = {
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
  modules: {
    list: () => request("/modules"),
    get: (id) => request(`/modules/${id}`),
    create: (data) => request("/modules", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/modules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => request(`/modules/${id}`, { method: "DELETE" }),
    addMaterial: (id, data) => request(`/modules/${id}/materials`, { method: "POST", body: JSON.stringify(data) }),
    updateMaterial: (id, lineId, data) => request(`/modules/${id}/materials/${lineId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeMaterial: (id, lineId) => request(`/modules/${id}/materials/${lineId}`, { method: "DELETE" }),
    addLabor: (id, data) => request(`/modules/${id}/labor`, { method: "POST", body: JSON.stringify(data) }),
    updateLabor: (id, lineId, data) => request(`/modules/${id}/labor/${lineId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeLabor: (id, lineId) => request(`/modules/${id}/labor/${lineId}`, { method: "DELETE" }),
  },
};

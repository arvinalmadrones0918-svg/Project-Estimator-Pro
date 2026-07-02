const BASE = "/api/catalog";

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function qs(p = {}) {
  const entries = Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.length ? `?${new URLSearchParams(entries)}` : "";
}

export function makeCatalogApi(slug) {
  return {
    list: (params) => req(`/${slug}${qs(params)}`),
    get: (id) => req(`/${slug}/${id}`),
    filters: () => req(`/${slug}/filters`),
    create: (data) => req(`/${slug}`, { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => req(`/${slug}/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    duplicate: (id) => req(`/${slug}/${id}/duplicate`, { method: "POST" }),
    deactivate: (id) => req(`/${slug}/${id}/deactivate`, { method: "PUT" }),
    activate: (id) => req(`/${slug}/${id}/activate`, { method: "PUT" }),
    remove: (id) => req(`/${slug}/${id}`, { method: "DELETE" }),
    restore: (id) => req(`/${slug}/${id}/restore`, { method: "PUT" }),
    priceHistory: (id) => req(`/${slug}/${id}/price-history`),
    bulk: (data) => req(`/${slug}/bulk`, { method: "POST", body: JSON.stringify(data) }),
    importPreview: (rows) => req(`/${slug}/import/preview`, { method: "POST", body: JSON.stringify({ rows }) }),
    importConfirm: (rows, mergeExisting) => req(`/${slug}/import/confirm`, { method: "POST", body: JSON.stringify({ rows, mergeExisting }) }),
    exportUrl: (params, format) => `${BASE}/${slug}/export${qs({ ...params, format })}`,
  };
}

export const catalogApis = {
  materials: makeCatalogApi("materials"),
  labor: makeCatalogApi("labor"),
  equipment: makeCatalogApi("equipment"),
  subcontract: makeCatalogApi("subcontract"),
  "other-costs": makeCatalogApi("other-costs"),
};

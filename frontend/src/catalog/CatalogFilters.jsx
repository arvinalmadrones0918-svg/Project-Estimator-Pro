import { useEffect, useRef } from "react";

export default function CatalogFilters({ filters, filterOptions, onChange, onSearch }) {
  const searchRef = useRef(null);

  // "/" focuses search
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function set(key, value) {
    onChange({ ...filters, [key]: value, page: 1 });
  }

  return (
    <div className="catalog-filters">
      <input
        ref={searchRef}
        className="catalog-search"
        placeholder="Search by name, code, supplier… (press / to focus)"
        value={filters.q ?? ""}
        onChange={(e) => set("q", e.target.value)}
      />

      <select value={filters.category ?? ""} onChange={(e) => set("category", e.target.value)}>
        <option value="">All Categories</option>
        {filterOptions.categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      {filterOptions.units.length > 0 && (
        <select value={filters.unit ?? ""} onChange={(e) => set("unit", e.target.value)}>
          <option value="">All Units</option>
          {filterOptions.units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      )}

      <select value={filters.supplier ?? ""} onChange={(e) => set("supplier", e.target.value)}>
        <option value="">All Suppliers</option>
        {filterOptions.suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <div className="price-range-filter">
        <input
          className="price-range-input"
          type="number"
          placeholder="Min price"
          value={filters.minPrice ?? ""}
          onChange={(e) => set("minPrice", e.target.value)}
        />
        <span>–</span>
        <input
          className="price-range-input"
          type="number"
          placeholder="Max price"
          value={filters.maxPrice ?? ""}
          onChange={(e) => set("maxPrice", e.target.value)}
        />
      </div>

      <select value={filters.status ?? "active"} onChange={(e) => set("status", e.target.value)}>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="all">All</option>
      </select>

      <button className="secondary-button" onClick={() => onChange({ status: "active", page: 1 })}>
        Clear
      </button>
    </div>
  );
}

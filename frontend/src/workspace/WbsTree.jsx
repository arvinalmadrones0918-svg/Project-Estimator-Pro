import { useState } from "react";

// Builds, for each WBS node, the list of work modules assigned directly to
// it (categories with no subcategories get modules attached at the category
// level; categories with subcategories only ever get modules attached at the
// subcategory level, matching how the "+ Add" buttons below create them).
function modulesFor(modules, categoryId, subcategoryId) {
  return modules.filter((m) => m.wbsCategoryId === categoryId && m.wbsSubcategoryId === (subcategoryId ?? null));
}

export default function WbsTree({ categories, modules, selectedModuleId, onSelectModule, onAddModule }) {
  const [expanded, setExpanded] = useState(() => new Set(categories.map((c) => c.id)));

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="wbs-tree">
      {categories.map((category) => {
        const isOpen = expanded.has(category.id);
        const hasSubcategories = category.subcategories.length > 0;
        const directModules = hasSubcategories ? [] : modulesFor(modules, category.id, null);
        return (
          <div key={category.id} className="wbs-node">
            <div className="wbs-node-row wbs-category-row">
              <button className="wbs-toggle" onClick={() => toggle(category.id)} aria-label={isOpen ? "Collapse" : "Expand"}>
                {isOpen ? "▾" : "▸"}
              </button>
              <span className="wbs-label">{category.name}</span>
              {!hasSubcategories && (
                <button className="link-button wbs-add" onClick={() => onAddModule(category.id, null)}>
                  + Add
                </button>
              )}
            </div>
            {isOpen && (
              <div className="wbs-children">
                {category.subcategories.map((sub) => {
                  const subModules = modulesFor(modules, category.id, sub.id);
                  return (
                    <div key={sub.id} className="wbs-node">
                      <div className="wbs-node-row wbs-subcategory-row">
                        <span className="wbs-label">{sub.name}</span>
                        <button className="link-button wbs-add" onClick={() => onAddModule(category.id, sub.id)}>
                          + Add
                        </button>
                      </div>
                      <div className="wbs-children">
                        {subModules.map((m) => (
                          <button
                            key={m.id}
                            className={`wbs-leaf ${m.id === selectedModuleId ? "selected" : ""}`}
                            onClick={() => onSelectModule(m.id)}
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {directModules.map((m) => (
                  <button
                    key={m.id}
                    className={`wbs-leaf ${m.id === selectedModuleId ? "selected" : ""}`}
                    onClick={() => onSelectModule(m.id)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

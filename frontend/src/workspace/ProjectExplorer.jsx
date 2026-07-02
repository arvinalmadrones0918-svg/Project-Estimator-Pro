import { useState } from "react";

// Unified Project Explorer tree (replaces the flat sidebar + separate WBS tree):
//
//   Project
//   ├── Project Information
//   ├── WBS
//   │   ├── Mechanical → HVAC / Plumbing / … → work items
//   │   ├── Electrical …
//   │   └── General Requirements
//   ├── Cost Summary
//   └── Reports
//
// Work items support rename / duplicate / delete and drag-and-drop between WBS
// nodes. Nodes expand/collapse. Selecting a node drives the main content area.
function modulesFor(modules, categoryId, subcategoryId) {
  return modules.filter((m) => m.wbsCategoryId === categoryId && m.wbsSubcategoryId === (subcategoryId ?? null));
}

export default function ProjectExplorer({
  project, categories, modules, selection, onSelect,
  onAddModule, onRenameModule, onDuplicateModule, onDeleteModule, onMoveModule,
}) {
  const [expanded, setExpanded] = useState(
    () => new Set(["project", "wbs", ...categories.map((c) => `cat-${c.id}`)])
  );
  const [dragId, setDragId] = useState(null);

  function toggle(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  const isOpen = (key) => expanded.has(key);

  function NavNode({ id, icon, label, depth = 1 }) {
    const active = selection?.type === id;
    return (
      <div
        className={`pe-row pe-nav ${active ? "active" : ""}`}
        style={{ paddingLeft: depth * 14 }}
        onClick={() => onSelect({ type: id })}
      >
        <span className="pe-icon">{icon}</span>
        <span className="pe-label">{label}</span>
      </div>
    );
  }

  function WorkItem({ m, depth }) {
    const active = selection?.type === "module" && selection.moduleId === m.id;
    return (
      <div
        className={`pe-row pe-leaf ${active ? "active" : ""} ${dragId === m.id ? "dragging" : ""}`}
        style={{ paddingLeft: depth * 14 }}
        draggable
        onDragStart={() => setDragId(m.id)}
        onDragEnd={() => setDragId(null)}
        onClick={() => onSelect({ type: "module", moduleId: m.id })}
      >
        <span className="pe-icon">📄</span>
        <span className="pe-label" title={m.name}>{m.name}</span>
        <span className="pe-actions" onClick={(e) => e.stopPropagation()}>
          <button className="pe-act" title="Rename" onClick={() => onRenameModule(m)}>✎</button>
          <button className="pe-act" title="Duplicate" onClick={() => onDuplicateModule(m)}>⧉</button>
          <button className="pe-act danger" title="Delete" onClick={() => onDeleteModule(m)}>✕</button>
        </span>
      </div>
    );
  }

  // A WBS node that accepts dropped work items (moves them here).
  function dropProps(categoryId, subcategoryId) {
    return {
      onDragOver: (e) => { if (dragId) e.preventDefault(); },
      onDrop: (e) => {
        e.preventDefault();
        if (dragId) { onMoveModule(dragId, categoryId, subcategoryId); setDragId(null); }
      },
    };
  }

  return (
    <div className="project-explorer">
      {/* Project root */}
      <div className="pe-row pe-root" onClick={() => toggle("project")}>
        <button className="pe-toggle">{isOpen("project") ? "▾" : "▸"}</button>
        <span className="pe-icon">🏗️</span>
        <span className="pe-label pe-project-name">{project.name}</span>
      </div>

      {isOpen("project") && (
        <>
          <NavNode id="info" icon="ℹ️" label="Project Information" />

          {/* WBS group */}
          <div className="pe-row pe-group" style={{ paddingLeft: 14 }} onClick={() => toggle("wbs")}>
            <button className="pe-toggle">{isOpen("wbs") ? "▾" : "▸"}</button>
            <span className="pe-icon">🗂️</span>
            <span className="pe-label">WBS</span>
          </div>

          {isOpen("wbs") && categories.map((cat) => {
            const hasSubs = cat.subcategories.length > 0;
            const catKey = `cat-${cat.id}`;
            const directItems = hasSubs ? [] : modulesFor(modules, cat.id, null);
            return (
              <div key={cat.id}>
                <div className="pe-row pe-category" style={{ paddingLeft: 28 }} {...dropProps(cat.id, null)}>
                  <button className="pe-toggle" onClick={() => toggle(catKey)}>{isOpen(catKey) ? "▾" : "▸"}</button>
                  <span className="pe-label">{cat.name}</span>
                  {!hasSubs && <button className="pe-add" onClick={() => onAddModule(cat.id, null)}>+ Add</button>}
                </div>
                {isOpen(catKey) && (
                  <>
                    {cat.subcategories.map((sub) => {
                      const subItems = modulesFor(modules, cat.id, sub.id);
                      return (
                        <div key={sub.id}>
                          <div className="pe-row pe-subcategory" style={{ paddingLeft: 44 }} {...dropProps(cat.id, sub.id)}>
                            <span className="pe-label">{sub.name}</span>
                            <button className="pe-add" onClick={() => onAddModule(cat.id, sub.id)}>+ Add</button>
                          </div>
                          {subItems.map((m) => <WorkItem key={m.id} m={m} depth={4.4} />)}
                        </div>
                      );
                    })}
                    {directItems.map((m) => <WorkItem key={m.id} m={m} depth={3} />)}
                  </>
                )}
              </div>
            );
          })}

          <NavNode id="worksheet" icon="📋" label="Estimate Worksheet" />
          <NavNode id="costSummary" icon="📊" label="Cost Summary" />
          <NavNode id="costControl" icon="📉" label="Cost Control" />
          <NavNode id="procurement" icon="🛒" label="Procurement" />
          <NavNode id="reports" icon="📑" label="Reports" />
        </>
      )}
    </div>
  );
}

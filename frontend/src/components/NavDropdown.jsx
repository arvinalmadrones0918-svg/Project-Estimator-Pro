import { useEffect, useRef, useState } from "react";

// Reusable top-navigation dropdown menu.
//
// Props:
//   label     — the trigger button text
//   items     — [{ key, label }]
//   activeKey — the currently active tab key (for highlighting)
//   onSelect  — (key) => void, called when an item is chosen
//
// Behavior: opens on click, closes on select / outside click / Escape,
// supports arrow-key navigation, and preserves accessibility + active-tab
// highlighting (the trigger is "active" when one of its items is active).
export default function NavDropdown({ label, items, activeKey, onSelect }) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const rootRef = useRef(null);
  const itemRefs = useRef([]);

  const containsActive = items.some((i) => i.key === activeKey);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // Move DOM focus to the highlighted item.
  useEffect(() => {
    if (open && focusIndex >= 0) itemRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  function openMenu(index = 0) { setOpen(true); setFocusIndex(index); }
  function closeMenu(returnFocus = true) {
    setOpen(false);
    setFocusIndex(-1);
    if (returnFocus) rootRef.current?.querySelector(".nav-dropdown-trigger")?.focus();
  }
  function choose(key) { onSelect(key); closeMenu(false); }

  function onTriggerKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu(0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(items.length - 1);
    } else if (e.key === "Escape") {
      closeMenu(false);
    }
  }

  function onMenuKeyDown(e) {
    if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setFocusIndex((i) => (i + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIndex((i) => (i - 1 + items.length) % items.length); }
    else if (e.key === "Home") { e.preventDefault(); setFocusIndex(0); }
    else if (e.key === "End") { e.preventDefault(); setFocusIndex(items.length - 1); }
    else if (e.key === "Tab") { closeMenu(false); }
  }

  return (
    <div className="nav-dropdown" ref={rootRef}>
      <button
        type="button"
        className={`nav-dropdown-trigger ${containsActive ? "active" : ""} ${open ? "open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? closeMenu(false) : openMenu(-1))}
        onKeyDown={onTriggerKeyDown}
      >
        {label} <span className="nav-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="nav-dropdown-menu" role="menu" onKeyDown={onMenuKeyDown}>
          {items.map((item, i) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                ref={(el) => (itemRefs.current[i] = el)}
                tabIndex={-1}
                className={`nav-dropdown-item ${item.key === activeKey ? "active" : ""}`}
                onClick={() => choose(item.key)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

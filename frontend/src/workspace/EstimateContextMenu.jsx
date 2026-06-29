import { useEffect, useRef } from "react";

export default function EstimateContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  // Keep menu on screen
  const style = { position: "fixed", top: y, left: x, zIndex: 9999 };

  return (
    <div ref={ref} className="context-menu" style={style}>
      {items.map((item, i) =>
        item === "---" ? (
          <div key={i} className="context-menu-sep" />
        ) : (
          <button
            key={i}
            className={`context-menu-item${item.danger ? " danger" : ""}`}
            disabled={item.disabled}
            onClick={() => { item.action(); onClose(); }}
          >
            {item.icon && <span className="context-menu-icon">{item.icon}</span>}
            {item.label}
            {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  );
}

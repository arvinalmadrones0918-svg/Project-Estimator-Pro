import { useEffect, useRef, useState } from "react";
import { api } from "../api";

// Header global search across projects, clients, suppliers, materials,
// assemblies, UPA, documents and specifications.
export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q || q.length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      api.tendering.search(q).then((d) => { setResults(d.results); setOpen(true); }).catch(() => {});
    }, 250);
  }, [q]);

  useEffect(() => {
    function onClick(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const grouped = results.reduce((acc, r) => { (acc[r.type] ||= []).push(r); return acc; }, {});

  return (
    <div className="global-search" ref={boxRef}>
      <input
        className="global-search-input"
        placeholder="🔍 Search everything…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && q.length >= 2 && (
        <div className="global-search-results">
          {results.length === 0 ? (
            <div className="global-search-empty">No matches for “{q}”.</div>
          ) : (
            Object.entries(grouped).map(([type, items]) => (
              <div key={type} className="global-search-group">
                <div className="global-search-group-label">{type}</div>
                {items.map((r) => (
                  <div key={`${type}-${r.id}`} className="global-search-item">{r.label}</div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

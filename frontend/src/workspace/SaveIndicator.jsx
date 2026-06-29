export default function SaveIndicator({ state }) {
  if (state === "dirty") return <span className="save-indicator dirty" title="Unsaved changes">●</span>;
  if (state === "saving") return <span className="save-indicator saving">Saving…</span>;
  if (state === "saved") return <span className="save-indicator saved">Saved</span>;
  return null;
}

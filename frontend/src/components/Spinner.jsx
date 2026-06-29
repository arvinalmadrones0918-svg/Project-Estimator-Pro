export default function Spinner({ label = "Loading…" }) {
  return (
    <div className="spinner-row" role="status">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

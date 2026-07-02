import EstimateGrid from "./EstimateGrid";

export default function NodeEditor({ moduleId, catalogs, onChange, setError }) {
  return (
    <EstimateGrid
      moduleId={moduleId}
      onChange={onChange}
      setError={setError}
    />
  );
}

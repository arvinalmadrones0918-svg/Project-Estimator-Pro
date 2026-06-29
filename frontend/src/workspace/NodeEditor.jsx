import { useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../utils";
import Spinner from "../components/Spinner";
import CatalogLineSection from "./CatalogLineSection";
import DirectCostSection from "./DirectCostSection";
import AssemblySection from "./AssemblySection";

export default function NodeEditor({ moduleId, catalogs, onChange, setError }) {
  const [detail, setDetail] = useState(null);

  function loadDetail() {
    api.modules.get(moduleId).then(setDetail).catch((e) => setError(e.message));
  }

  useEffect(loadDetail, [moduleId]);

  async function withRefresh(action) {
    try {
      await action();
      loadDetail();
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!detail) return <Spinner label="Loading work item…" />;

  return (
    <div className="node-editor">
      <h2>{detail.name}</h2>
      {detail.description && <p className="description">{detail.description}</p>}

      <CatalogLineSection
        title="Materials"
        lines={detail.materialLines}
        catalogItems={catalogs.materials}
        catalogLabel="Select material"
        rateField="unitPrice"
        currentRateField="currentUnitPrice"
        onAdd={({ refId, quantity }) =>
          withRefresh(() => api.modules.addMaterial(moduleId, { materialId: refId, quantity }))
        }
        onUpdateLine={(lineId, data) => withRefresh(() => api.modules.updateMaterial(moduleId, lineId, data))}
        onRemoveLine={(lineId) => withRefresh(() => api.modules.removeMaterial(moduleId, lineId))}
      />

      <CatalogLineSection
        title="Labor"
        lines={detail.laborLines}
        catalogItems={catalogs.laborSpecializations}
        catalogLabel="Select specialization"
        quantityLabel="Hours"
        rateField="hourlyRate"
        currentRateField="currentHourlyRate"
        rateSuffix="/hr"
        onAdd={({ refId, quantity }) =>
          withRefresh(() => api.modules.addLabor(moduleId, { specializationId: refId, quantity }))
        }
        onUpdateLine={(lineId, data) => withRefresh(() => api.modules.updateLabor(moduleId, lineId, data))}
        onRemoveLine={(lineId) => withRefresh(() => api.modules.removeLabor(moduleId, lineId))}
      />

      <CatalogLineSection
        title="Equipment"
        lines={detail.equipmentLines}
        catalogItems={catalogs.equipment}
        catalogLabel="Select equipment"
        rateField="unitPrice"
        currentRateField="currentUnitPrice"
        onAdd={({ refId, quantity }) =>
          withRefresh(() => api.modules.addEquipment(moduleId, { equipmentId: refId, quantity }))
        }
        onUpdateLine={(lineId, data) => withRefresh(() => api.modules.updateEquipment(moduleId, lineId, data))}
        onRemoveLine={(lineId) => withRefresh(() => api.modules.removeEquipment(moduleId, lineId))}
      />

      <DirectCostSection
        title="Subcontract"
        lines={detail.subcontractLines}
        onAdd={(data) => withRefresh(() => api.modules.addSubcontract(moduleId, data))}
        onUpdateLine={(lineId, data) => withRefresh(() => api.modules.updateSubcontract(moduleId, lineId, data))}
        onRemoveLine={(lineId) => withRefresh(() => api.modules.removeSubcontract(moduleId, lineId))}
      />

      <DirectCostSection
        title="Other Costs"
        lines={detail.otherCostLines}
        onAdd={(data) => withRefresh(() => api.modules.addOtherCost(moduleId, data))}
        onUpdateLine={(lineId, data) => withRefresh(() => api.modules.updateOtherCost(moduleId, lineId, data))}
        onRemoveLine={(lineId) => withRefresh(() => api.modules.removeOtherCost(moduleId, lineId))}
      />

      <AssemblySection
        lines={detail.assemblyLines}
        assemblies={catalogs.assemblies}
        onAdd={(data) => withRefresh(() => api.modules.addAssembly(moduleId, data))}
        onUpdateLine={(lineId, data) => withRefresh(() => api.modules.updateAssembly(moduleId, lineId, data))}
        onRemoveLine={(lineId) => withRefresh(() => api.modules.removeAssembly(moduleId, lineId))}
      />

      <div className="node-editor-total">Work Item Total: {money(detail.totalCost)}</div>
    </div>
  );
}

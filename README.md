# Project-Estimator-Pro
Comprehensive estimate for construction

## Structure

- `backend/` — Express API backed by SQLite (Node's built-in `node:sqlite`). Exposes materials, labor specializations, and work modules with separated material/labor cost breakdowns.
- `frontend/` — React (Vite) app with three views: Work Modules, Materials Database, Labor Specializations.

## Running locally

```sh
# Backend (http://localhost:4000)
cd backend
npm install
npm run seed   # seeds sample materials and labor specializations
npm run dev

# Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

The frontend dev server proxies `/api` requests to the backend on port 4000.

## Data model

- **Material**: name, category, unit, editable `unitPrice` — the materials database.
- **LaborSpecialization**: name, editable `hourlyRate`.
- **WorkModule**: name, description.
- **ModuleMaterial**: links a work module to a material with a quantity (material cost = quantity × unitPrice).
- **ModuleLabor**: links a work module to a labor specialization with a quantity/hours (labor cost = quantity × hourlyRate).

Each work module's cost is returned as separate `materialCost`, `laborCost`, and `totalCost`, with full line-item breakdowns for both.

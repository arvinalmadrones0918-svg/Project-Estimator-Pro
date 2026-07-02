# Testing

Project Estimator Pro has three test layers.

## Backend — Jest + Supertest

```bash
cd backend
npm test           # run all tests
npm run test:watch # watch mode
npm run coverage   # with coverage report
```

- ESM Jest (run via `node --experimental-vm-modules`). The `node:sqlite`
  builtin is mapped to a shim (`test/sqlite-shim.cjs`) that loads it through
  `process.getBuiltinModule`, since Jest's resolver doesn't classify it.
- Each run uses an **isolated throwaway database** (`test/setup.cjs` sets
  `DB_PATH` to a temp file) — tests never touch `data.db`.
- Suites: `costEngine.test.js` (engine math — waterfall, UPA, GR methods,
  billing) and `api.test.js` (Supertest integration: migrations, Project/WBS/
  Catalog/Assembly CRUD, calculation endpoints, auth, error handling).

## Frontend — Vitest + React Testing Library

```bash
cd frontend
npm test           # run all tests
npm run test:watch # watch mode
npm run coverage   # with coverage report
```

- jsdom environment, `@testing-library/react` + `@testing-library/jest-dom`.
- Suites: `utils.test.js` (formatting), `useTheme.test.jsx` (hook),
  `components.test.jsx` (ErrorBanner, Spinner, BottomSummaryBar / calculation
  summary, AnimatedNumber).

## End-to-end — Playwright

```bash
# with backend (:4000) and frontend (:5173) running
cd frontend
npm run e2e
```

Covers the full estimating journey: sign in (UI) → create project → create work
module → add materials / labor / equipment / assembly → verify engine totals →
export the BOQ (valid XLSX). Uses the pre-installed Chromium via
`executablePath` (no browser download).

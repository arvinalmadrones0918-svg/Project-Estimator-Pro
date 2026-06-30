# Project Estimator Pro

**Version 1.0** — a complete, professional construction-estimating and project
cost-control platform: master data, estimating, the cost engine, procurement,
rate analysis, BOQ/reporting, tendering, general requirements, Excel exchange,
multi-user security & approval workflow, cost control, and executive BI.

## Tech

- **Backend** — Node.js 22 + Express, SQLite via the built-in `node:sqlite`.
  All cost logic lives in centralized services (`costEngine`, `costControl`,
  `analytics`) — never duplicated.
- **Frontend** — React 19 + Vite, Recharts, SheetJS.

## Quick start

```sh
# Backend (http://localhost:4000)
cd backend && npm install && node src/index.js

# Frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

Sign in with `admin` / `admin123` (change it after first login). The dev server
proxies `/api` to the backend.

## Tests

```sh
cd backend && npm test          # cost-engine / cost-control unit tests
cd frontend && npm run build    # type/compile check + production build
```

## Documentation

See [`docs/`](docs/):

- [Release Notes](docs/RELEASE_NOTES.md) · [Changelog](docs/CHANGELOG.md)
- [Installation](docs/INSTALLATION.md) · [Deployment](docs/DEPLOYMENT.md)
- [User Manual](docs/USER_MANUAL.md) · [Administrator Manual](docs/ADMINISTRATOR_MANUAL.md)
- [API Reference](docs/API_REFERENCE.md) · [Database Schema](docs/DATABASE_SCHEMA.md)

## Deployment

`docker compose up -d --build` brings up the backend and an Nginx-served
frontend. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Ubuntu/Windows
Server, SSL, backups, logging, and monitoring.

## License

Proprietary — © Project Estimator Pro.

# Installation Guide

## Requirements

- **Node.js 22+** (uses the built-in `node:sqlite` module).
- npm 10+.
- ~200 MB disk for the app + database growth.

## Local development

```bash
# Backend (port 4000)
cd backend
npm install
node src/index.js        # or: npm run dev

# Frontend (port 5173)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in with `admin` / `admin123`.

The Vite dev server proxies `/api/*` to the backend. For a production build:

```bash
cd frontend
npm run build            # outputs to frontend/dist
```

## Seeding sample data (optional)

```bash
cd backend
npm run seed
```

## Environment

Copy `.env.example` to `.env` and adjust:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | 4000    | Backend HTTP port |
| `NODE_ENV` | development | Set to `production` in production |

The SQLite database file is created automatically at `backend/data.db` on
first run; non-destructive migrations run at every startup.

## Production deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Docker, Docker Compose, Nginx, Ubuntu/
Windows Server, SSL, backups, logging, and monitoring.

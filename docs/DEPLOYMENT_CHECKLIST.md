# Production Deployment Checklist — Project Estimator Pro v1.0

Use this checklist before promoting a build to production.

## 1. Environment
- [ ] Copy `.env.example` → `.env` and set values.
- [ ] `NODE_ENV=production`
- [ ] `PORT` (backend, default 4000)
- [ ] `DB_PATH` points at a persistent volume (e.g. `/app/backend/data.db`)
- [ ] `BACKUP_DIR` points at a persistent, backed-up location
- [ ] Rotate the default admin password (`admin` / `admin123`) immediately.

## 2. Build
- [ ] `cd frontend && npm ci && npm run build` (outputs `frontend/dist`)
- [ ] `cd backend && npm ci`
- [ ] Backend tests green: `cd backend && npm test`
- [ ] Frontend tests green: `cd frontend && npm run test`
- [ ] Playwright smoke green: `node frontend/e2e/estimate-flow.mjs`

## 3. Containers
- [ ] `docker compose build`
- [ ] `docker compose up -d`
- [ ] Backend health: `curl http://localhost/api/health` → `{ "status": "ok" }`
- [ ] Frontend served by Nginx on port 80.

## 4. Security
- [ ] HTTPS terminated (Nginx `443` or an upstream load balancer) — see `DEPLOYMENT.md`.
- [ ] Security headers present (`X-Frame-Options`, `X-Content-Type-Options`, HSTS in prod).
- [ ] Rate limiting active (`X-RateLimit-*` headers).
- [ ] CORS restricted to trusted origins if the API is public.
- [ ] Input sanitization + parameterized queries verified (no string-built SQL).

## 5. Data
- [ ] Take a baseline backup: `POST /api/admin/backups` (or `scripts/backup.sh`).
- [ ] Confirm restore procedure on a staging copy.
- [ ] Schedule automatic backups (cron → `scripts/backup.sh`).

## 6. Documentation
- [ ] `INSTALLATION.md`, `ADMINISTRATOR_MANUAL.md`, `USER_MANUAL.md`, `API_REFERENCE.md` reviewed.
- [ ] API docs reachable at `/api/docs` (Swagger UI) and `/api/openapi.json`.

## 7. Release
- [ ] Version tag `v1.0.0` created.
- [ ] `RELEASE_NOTES.md` and `CHANGELOG.md` up to date.
- [ ] Smoke test the full estimate → procurement → cost-control → report flow.

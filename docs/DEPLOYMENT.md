# Deployment Guide

## Option A — Docker Compose (recommended)

```bash
git clone <repo> estimator && cd estimator
docker compose up -d --build
```

- Frontend (Nginx) serves on port 80 and proxies `/api` to the backend.
- The SQLite database persists in the `estimator-data` named volume.
- Update with `git pull && docker compose up -d --build`.

## Option B — Ubuntu Server (bare metal / VM)

```bash
# Install Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx sqlite3

# App
sudo mkdir -p /opt/estimator && cd /opt/estimator
git clone <repo> .
cd backend && npm install --omit=dev
cd ../frontend && npm install && npm run build

# Run backend with systemd (see unit below); serve frontend/dist via Nginx.
```

Example systemd unit `/etc/systemd/system/estimator.service`:

```ini
[Unit]
Description=Project Estimator Pro backend
After=network.target

[Service]
WorkingDirectory=/opt/estimator/backend
ExecStart=/usr/bin/node src/index.js
Environment=NODE_ENV=production PORT=4000
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

Point Nginx `root` at `/opt/estimator/frontend/dist` and proxy `/api` to
`http://127.0.0.1:4000` (see `frontend/nginx.conf` for a template).

## Option C — Windows Server

1. Install Node 22 (MSI) and (optionally) NSSM to run the backend as a service.
2. `cd backend && npm install --omit=dev`; run `node src\index.js` (or via NSSM).
3. `cd frontend && npm install && npm run build`.
4. Serve `frontend\dist` and proxy `/api` to `http://localhost:4000` using IIS
   (URL Rewrite + ARR) or Nginx for Windows.

## SSL

Terminate TLS at Nginx (or a load balancer). With certbot:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d estimator.example.com
```

For the Docker setup, mount certificates into the frontend container and add a
`listen 443 ssl;` server block, or place a reverse proxy (Caddy/Traefik) in
front.

## Backups

Schedule `scripts/backup.sh` via cron (uses SQLite's online `.backup`, gzips,
and prunes after 30 days):

```cron
0 2 * * * DB_PATH=/opt/estimator/backend/data.db BACKUP_DIR=/var/backups/estimator /opt/estimator/scripts/backup.sh
```

For Docker, run it inside the backend container or against the volume path.

## Logging & monitoring

- The backend logs startup and 5xx errors to stdout; capture with
  `journalctl -u estimator` (systemd) or `docker compose logs -f`.
- Health check: `GET /api/reports/types` returns 200 when the API is up; point
  your uptime monitor or container healthcheck at it.
- For metrics/alerting, place the app behind a reverse proxy that exports
  access logs to your stack (e.g. Prometheus + Grafana, or a hosted APM).

## Environment configuration

Copy `.env.example` to `.env`. Key variables: `PORT`, `NODE_ENV`. The database
file is created automatically and migrated non-destructively on startup.

## First run

Sign in with `admin` / `admin123` and change the password immediately
(Administration → Users, and the user menu → Change Password).

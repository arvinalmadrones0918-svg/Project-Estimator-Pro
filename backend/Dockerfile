# Backend — Node 22 (required for the built-in node:sqlite module)
FROM node:22-slim AS base
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ ./

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Persist the SQLite database on a volume mounted at /app/backend/data
VOLUME ["/app/backend"]

CMD ["node", "src/index.js"]

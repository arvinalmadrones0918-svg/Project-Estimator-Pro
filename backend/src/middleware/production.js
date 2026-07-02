import zlib from "node:zlib";

// Phase 11 (Production) — hardening middleware, implemented without extra
// dependencies so the production build stays lean and installable offline.

// Helmet-style security headers.
export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

// Simple in-memory sliding-window rate limiter (per IP).
export function rateLimiter({ windowMs = 60_000, max = 300 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    if (process.env.NODE_ENV === "test") return next();
    const key = req.ipAddress || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const rec = hits.get(key) || { count: 0, reset: now + windowMs };
    if (now > rec.reset) { rec.count = 0; rec.reset = now + windowMs; }
    rec.count += 1;
    hits.set(key, rec);
    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - rec.count));
    if (rec.count > max) return res.status(429).json({ error: "Too many requests, please slow down." });
    next();
  };
}

// Recursively strip <script> tags / obvious XSS payloads from request bodies.
function sanitize(value) {
  if (typeof value === "string") {
    return value.replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "").replace(/\bon\w+\s*=\s*"[^"]*"/gi, "");
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    for (const k of Object.keys(value)) value[k] = sanitize(value[k]);
    return value;
  }
  return value;
}
export function inputSanitizer(req, res, next) {
  if (req.body && typeof req.body === "object") req.body = sanitize(req.body);
  next();
}

// gzip response compression for JSON payloads (skips small/HEAD responses).
export function compression({ threshold = 1024 } = {}) {
  return (req, res, next) => {
    const accepts = (req.headers["accept-encoding"] || "").includes("gzip");
    if (!accepts || req.method === "HEAD") return next();
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const text = JSON.stringify(body);
      if (text.length < threshold) return originalJson(body);
      const gz = zlib.gzipSync(text);
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Length", gz.length);
      res.end(gz);
      return res;
    };
    next();
  };
}

// Lightweight request logger (method, path, status, ms).
export function requestLogger(req, res, next) {
  if (process.env.NODE_ENV === "test") return next();
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const line = `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`;
    if (res.statusCode >= 500) console.error(line);
    else console.log(line);
  });
  next();
}

// Global error handler — last middleware. Returns clean JSON; never leaks
// stack traces in production.
export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error("Unhandled error:", err);
  const payload = { error: err.publicMessage || (status >= 500 ? "Internal server error" : err.message) };
  if (process.env.NODE_ENV !== "production" && status >= 500) payload.detail = err.message;
  res.status(status).json(payload);
}

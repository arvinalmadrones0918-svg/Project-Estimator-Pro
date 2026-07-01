// Runs before each test file (before db.js is imported), pointing the database
// at an isolated throwaway file so tests never touch the real data.db.
const os = require("os");
const path = require("path");
const fs = require("fs");

const dbFile = path.join(os.tmpdir(), `pe-test-${process.env.JEST_WORKER_ID || "1"}.db`);
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  try { fs.unlinkSync(dbFile + suffix); } catch { /* not present */ }
}
process.env.DB_PATH = dbFile;
process.env.NODE_ENV = "test";

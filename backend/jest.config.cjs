// Jest config for the ESM backend. Run via:
//   node --experimental-vm-modules node_modules/jest/bin/jest.js
module.exports = {
  testEnvironment: "node",
  moduleNameMapper: {
    "^node:sqlite$": "<rootDir>/test/sqlite-shim.cjs",
  },
  setupFiles: ["<rootDir>/test/setup.cjs"],
  transform: {},                       // native ESM, no Babel transform
  testMatch: ["**/test/**/*.test.js"],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/index.js",
    "!src/seed.js",
  ],
  coverageReporters: ["text-summary", "lcov"],
  // Routes share a singleton DB; run serially so isolated test DBs are clean.
  maxWorkers: 1,
};

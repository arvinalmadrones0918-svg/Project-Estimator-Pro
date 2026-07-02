// Vitest setup: jest-dom matchers + a default fetch mock so components that
// load data on mount don't make real network calls during unit tests.
import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// Default: any fetch resolves to an empty-ish payload. Individual tests can
// override global.fetch as needed.
if (!global.fetch) {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
  );
}

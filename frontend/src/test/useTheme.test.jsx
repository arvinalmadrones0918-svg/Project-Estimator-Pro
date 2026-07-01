import { describe, test, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "../hooks/useTheme";

describe("useTheme hook", () => {
  beforeEach(() => localStorage.clear());

  test("defaults to light and toggles to dark", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  test("persists the theme to localStorage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(localStorage.getItem("aep-theme")).toBe("dark");
  });
});

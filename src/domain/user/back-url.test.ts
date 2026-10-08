import { describe, expect, it } from "bun:test";
import { safeBackPath } from "./back-url";

describe("safeBackPath", () => {
  it("keeps an ordinary in-app path, query string and all", () => {
    expect(safeBackPath("/projects/demo/issues?status_id=1")).toBe("/projects/demo/issues?status_id=1");
  });

  it("falls back to / for a missing or empty value", () => {
    expect(safeBackPath(null)).toBe("/");
    expect(safeBackPath(undefined)).toBe("/");
    expect(safeBackPath("")).toBe("/");
  });

  it("rejects an absolute URL", () => {
    expect(safeBackPath("https://evil.example/phish")).toBe("/");
    expect(safeBackPath("http://evil.example")).toBe("/");
    expect(safeBackPath("javascript:alert(1)")).toBe("/");
  });

  it("rejects a protocol-relative target", () => {
    expect(safeBackPath("//evil.example/phish")).toBe("/");
  });

  it("rejects a backslash target — the URL parser would turn it into a protocol-relative one", () => {
    expect(safeBackPath("/\\evil.example/phish")).toBe("/");
    // Proves the premise: without the guard, this is what the redirect would resolve to.
    expect(new URL("/\\evil.example/phish", "http://localhost:3000").origin).toBe("http://evil.example");
  });

  it("rejects control characters that could split a response header", () => {
    expect(safeBackPath("/ok\r\nLocation: http://evil.example")).toBe("/");
  });
});

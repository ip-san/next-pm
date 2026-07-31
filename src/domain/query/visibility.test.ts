import { describe, expect, it } from "bun:test";
import { isQueryVisible } from "./visibility";

describe("isQueryVisible", () => {
  it("shows a private query only to its owner", () => {
    const query = { visibility: "private" as const, userId: "u1", roleIds: [] };
    expect(isQueryVisible(query, "u1", [])).toBe(true);
    expect(isQueryVisible(query, "u2", [])).toBe(false);
  });

  it("shows a roles query to the owner or a matching role", () => {
    const query = { visibility: "roles" as const, userId: "u1", roleIds: ["r1"] };
    expect(isQueryVisible(query, "u1", [])).toBe(true);
    expect(isQueryVisible(query, "u2", ["r1"])).toBe(true);
    expect(isQueryVisible(query, "u2", ["r2"])).toBe(false);
  });

  it("shows a public query to anyone", () => {
    const query = { visibility: "public" as const, userId: "u1", roleIds: [] };
    expect(isQueryVisible(query, "u2", [])).toBe(true);
  });
});

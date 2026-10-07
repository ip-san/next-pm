import { describe, expect, it } from "bun:test";
import { isQueryEditable, isQueryVisible } from "./visibility";

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

describe("isQueryEditable", () => {
  const owner = { userId: "u1", isAdmin: false, canManagePublicQueries: false };
  const stranger = { userId: "u2", isAdmin: false, canManagePublicQueries: false };

  it("lets the owner edit their own private query without any permission", () => {
    const query = { visibility: "private" as const, userId: "u1", projectId: "p1" };
    expect(isQueryEditable(query, owner)).toBe(true);
    expect(isQueryEditable(query, stranger)).toBe(false);
  });

  // Redmine's `is_public?` is `!is_private?`, so a roles-scoped query takes the same branch
  // as a fully public one — the owner alone is not enough.
  it("requires manage_public_queries for a public or roles query, even from its owner", () => {
    for (const visibility of ["public", "roles"] as const) {
      const query = { visibility, userId: "u1", projectId: "p1" };
      expect(isQueryEditable(query, owner)).toBe(false);
      expect(isQueryEditable(query, { ...owner, canManagePublicQueries: true })).toBe(true);
      expect(isQueryEditable(query, { ...stranger, canManagePublicQueries: true })).toBe(true);
    }
  });

  // "Members can not edit public queries that are for all project (only admin is allowed to)"
  it("reserves a global public query for admins", () => {
    const query = { visibility: "public" as const, userId: "u1", projectId: null };
    expect(isQueryEditable(query, { ...owner, canManagePublicQueries: true })).toBe(false);
    expect(isQueryEditable(query, { ...owner, isAdmin: true })).toBe(true);
  });

  it("lets an admin edit anything, and nobody edit as an anonymous visitor", () => {
    const query = { visibility: "private" as const, userId: "u1", projectId: "p1" };
    expect(isQueryEditable(query, { userId: "u9", isAdmin: true, canManagePublicQueries: false })).toBe(true);
    expect(isQueryEditable(query, { userId: null, isAdmin: false, canManagePublicQueries: true })).toBe(false);
  });
});

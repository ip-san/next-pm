import { describe, expect, it } from "bun:test";
import { parseRolePermissionEntries } from "./parse-role-permissions";

describe("parseRolePermissionEntries", () => {
  it("collects checked permissions per role", () => {
    const result = parseRolePermissionEntries([
      ["roleIds", "role-1"],
      ["permissions:role-1", "view_issues"],
      ["permissions:role-1", "add_issues"],
    ]);
    expect(result).toEqual({
      ok: true,
      permissionsByRoleId: new Map([["role-1", ["view_issues", "add_issues"]]]),
    });
  });

  it("registers a role with zero permissions checked (unchecking everything clears it)", () => {
    const result = parseRolePermissionEntries([["roleIds", "role-1"]]);
    expect(result).toEqual({ ok: true, permissionsByRoleId: new Map([["role-1", []]]) });
  });

  it("is independent of entry order", () => {
    const result = parseRolePermissionEntries([
      ["permissions:role-1", "view_issues"],
      ["roleIds", "role-1"],
    ]);
    expect(result).toEqual({ ok: true, permissionsByRoleId: new Map([["role-1", ["view_issues"]]]) });
  });

  it("handles multiple roles independently", () => {
    const result = parseRolePermissionEntries([
      ["roleIds", "role-1"],
      ["roleIds", "role-2"],
      ["permissions:role-1", "view_issues"],
      ["permissions:role-2", "manage_wiki"],
    ]);
    expect(result).toEqual({
      ok: true,
      permissionsByRoleId: new Map([
        ["role-1", ["view_issues"]],
        ["role-2", ["manage_wiki"]],
      ]),
    });
  });

  it("rejects a permission for a role that never sent its roleIds marker", () => {
    const result = parseRolePermissionEntries([["permissions:role-1", "view_issues"]]);
    expect(result).toEqual({ ok: false, error: "不正な入力が指定されました。" });
  });

  it("rejects an unregistered permission key", () => {
    const result = parseRolePermissionEntries([
      ["roleIds", "role-1"],
      ["permissions:role-1", "not_a_real_permission"],
    ]);
    expect(result).toEqual({ ok: false, error: "不正な入力が指定されました。" });
  });

  it("ignores unrelated entries", () => {
    const result = parseRolePermissionEntries([
      ["someOtherField", "x"],
      ["roleIds", "role-1"],
    ]);
    expect(result).toEqual({ ok: true, permissionsByRoleId: new Map([["role-1", []]]) });
  });
});

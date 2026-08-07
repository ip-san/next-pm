import { describe, expect, it } from "bun:test";
import { filterMembersWithPermission, memberUserIds } from "./entity";
import type { Role } from "@/domain/role/entity";

describe("memberUserIds", () => {
  it("drops group-only rows (no userId)", () => {
    const ids = memberUserIds([{ userId: "u1" }, { userId: null }, { userId: "u2" }]);
    expect(ids).toEqual(["u1", "u2"]);
  });
});

describe("filterMembersWithPermission", () => {
  const rolesById = new Map<string, Pick<Role, "permissions">>([
    ["role-with", { permissions: ["view_wiki_pages"] }],
    ["role-without", { permissions: ["view_issues"] }],
  ]);

  it("keeps members with at least one role granting the permission", () => {
    const members = [{ roleIds: ["role-with"] }, { roleIds: ["role-without"] }, { roleIds: ["role-without", "role-with"] }];
    const result = filterMembersWithPermission(members, rolesById, "view_wiki_pages");
    expect(result).toEqual([{ roleIds: ["role-with"] }, { roleIds: ["role-without", "role-with"] }]);
  });

  it("drops members whose role id isn't in the map at all", () => {
    const members = [{ roleIds: ["unknown-role"] }];
    const result = filterMembersWithPermission(members, rolesById, "view_wiki_pages");
    expect(result).toEqual([]);
  });
});

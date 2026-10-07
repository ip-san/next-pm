import { describe, expect, it } from "bun:test";
import { PERMISSION_REGISTRY } from "@/domain/authorization/permission-registry";
import {
  ROLE_BUILTIN_ANONYMOUS,
  ROLE_BUILTIN_MEMBER,
  ROLE_BUILTIN_NON_MEMBER,
  setablePermissions,
} from "./entity";

describe("setablePermissions", () => {
  it("offers every permission to an ordinary role", () => {
    expect(setablePermissions(ROLE_BUILTIN_MEMBER)).toEqual(Object.keys(PERMISSION_REGISTRY) as never);
  });

  it("hides members-only permissions from the Non member role", () => {
    const keys = setablePermissions(ROLE_BUILTIN_NON_MEMBER);
    expect(keys).not.toContain("manage_members");
    expect(keys).toContain("log_time");
    expect(keys).toContain("view_issues");
  });

  it("hides members-only and logged-in-only permissions from the Anonymous role", () => {
    const keys = setablePermissions(ROLE_BUILTIN_ANONYMOUS);
    expect(keys).not.toContain("manage_members");
    expect(keys).not.toContain("log_time");
    expect(keys).toContain("view_issues");
  });
});

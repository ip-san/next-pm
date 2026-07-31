import { describe, expect, it } from "bun:test";
import { can, type ProjectAuthorizationContext } from "./authorization-service";
import { ROLE_BUILTIN_ANONYMOUS, ROLE_BUILTIN_MEMBER, ROLE_BUILTIN_NON_MEMBER } from "@/domain/role/entity";

function project(overrides: Partial<ProjectAuthorizationContext> = {}): ProjectAuthorizationContext {
  return {
    isArchived: false,
    isActive: true,
    isPublic: false,
    enabledModules: ["issue_tracking"],
    ...overrides,
  };
}

describe("authorization-service.can", () => {
  it("denies an unregistered permission", () => {
    expect(
      can({
        permission: "not_a_real_permission",
        project: project(),
        actor: { kind: "admin" },
      }),
    ).toBe(false);
  });

  it("denies everything on an archived project, even for admins", () => {
    expect(
      can({
        permission: "view_issues",
        project: project({ isArchived: true }),
        actor: { kind: "admin" },
      }),
    ).toBe(false);
  });

  it("denies non-read-only permissions on a closed (inactive) project", () => {
    expect(
      can({
        permission: "add_issues",
        project: project({ isActive: false }),
        actor: { kind: "admin" },
      }),
    ).toBe(false);
  });

  it("allows read-only permissions on a closed project", () => {
    expect(
      can({
        permission: "view_issues",
        project: project({ isActive: false }),
        actor: { kind: "admin" },
      }),
    ).toBe(true);
  });

  it("denies a permission whose module is not enabled", () => {
    expect(
      can({
        permission: "log_time",
        project: project({ enabledModules: ["issue_tracking"] }),
        actor: { kind: "admin" },
      }),
    ).toBe(false);
  });

  it("admin bypasses role checks once archived/closed/module gates pass", () => {
    expect(
      can({
        permission: "view_issues",
        project: project(),
        actor: { kind: "admin" },
      }),
    ).toBe(true);
  });

  it("allows a member whose role grants the permission", () => {
    expect(
      can({
        permission: "add_issues",
        project: project(),
        actor: {
          kind: "member",
          roles: [{ builtin: ROLE_BUILTIN_MEMBER, permissions: ["add_issues"], issuesVisibility: "default" }],
        },
      }),
    ).toBe(true);
  });

  it("denies a member whose roles don't grant the permission", () => {
    expect(
      can({
        permission: "add_issues",
        project: project(),
        actor: {
          kind: "member",
          roles: [{ builtin: ROLE_BUILTIN_MEMBER, permissions: ["view_issues"], issuesVisibility: "default" }],
        },
      }),
    ).toBe(false);
  });

  it("resolves OR across multiple roles held by the same member", () => {
    expect(
      can({
        permission: "add_issues",
        project: project(),
        actor: {
          kind: "member",
          roles: [
            { builtin: ROLE_BUILTIN_MEMBER, permissions: ["view_issues"], issuesVisibility: "default" },
            { builtin: ROLE_BUILTIN_MEMBER, permissions: ["add_issues"], issuesVisibility: "default" },
          ],
        },
      }),
    ).toBe(true);
  });

  it("denies a non-member on a private project even if the non-member role grants the permission", () => {
    expect(
      can({
        permission: "view_issues",
        project: project({ isPublic: false }),
        actor: {
          kind: "non_member",
          role: { builtin: ROLE_BUILTIN_NON_MEMBER, permissions: ["view_issues"], issuesVisibility: "default" },
        },
      }),
    ).toBe(false);
  });

  it("allows a non-member on a public project when the non-member role grants the permission", () => {
    expect(
      can({
        permission: "view_issues",
        project: project({ isPublic: true }),
        actor: {
          kind: "non_member",
          role: { builtin: ROLE_BUILTIN_NON_MEMBER, permissions: ["view_issues"], issuesVisibility: "default" },
        },
      }),
    ).toBe(true);
  });

  it("allows an anonymous visitor on a public project when the anonymous role grants the permission", () => {
    expect(
      can({
        permission: "view_issues",
        project: project({ isPublic: true }),
        actor: {
          kind: "anonymous",
          role: { builtin: ROLE_BUILTIN_ANONYMOUS, permissions: ["view_issues"], issuesVisibility: "default" },
        },
      }),
    ).toBe(true);
  });

  it("denies an anonymous visitor on a private project", () => {
    expect(
      can({
        permission: "view_issues",
        project: project({ isPublic: false }),
        actor: {
          kind: "anonymous",
          role: { builtin: ROLE_BUILTIN_ANONYMOUS, permissions: ["view_issues"], issuesVisibility: "default" },
        },
      }),
    ).toBe(false);
  });
});

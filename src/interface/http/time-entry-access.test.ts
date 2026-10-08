import { describe, expect, it } from "bun:test";
import {
  canAccessTimeEntry,
  canAttachIssueToTimeEntry,
  canAttributeTimeEntryTo,
  filterAccessibleTimeEntries,
  timeEntriesVisibilityRoles,
  type TimeEntryAccessContext,
} from "./time-entry-access";
import type { AuthorizationActor, ProjectAuthorizationContext } from "@/domain/authorization/authorization-service";
import { ROLE_BUILTIN_MEMBER, ROLE_BUILTIN_NON_MEMBER, type Role } from "@/domain/role/entity";
import type { Issue } from "@/domain/issue/entity";
import type { PermissionKey } from "@/domain/authorization/permission-registry";

function role(permissions: PermissionKey[], overrides: Partial<Role> = {}): Role {
  return {
    builtin: ROLE_BUILTIN_MEMBER,
    permissions,
    issuesVisibility: "default",
    timeEntriesVisibility: "all",
    ...overrides,
  } as Role;
}

function project(overrides: Partial<ProjectAuthorizationContext> = {}): ProjectAuthorizationContext {
  return { isArchived: false, isActive: true, isPublic: true, enabledModules: ["time_tracking", "issue_tracking"], ...overrides };
}

function issue(overrides: Partial<Issue> = {}): Issue {
  return { id: "issue-1", projectId: "proj-1", isPrivate: false, authorId: "someone", assignedToId: null, assignedToType: null, ...overrides } as Issue;
}

function context(overrides: Partial<TimeEntryAccessContext> = {}): TimeEntryAccessContext {
  return {
    userId: "me",
    actor: { kind: "member", roles: [role(["view_time_entries", "log_time"])] },
    userGroupIds: [],
    projectContext: project(),
    issueById: new Map([["issue-1", issue()]]),
    ...overrides,
  };
}

const entry = { userId: "me", issueId: null as string | null };

describe("timeEntriesVisibilityRoles", () => {
  it("gives an admin a synthetic 'all' role", () => {
    expect(timeEntriesVisibilityRoles({ kind: "admin" })).toEqual([{ timeEntriesVisibility: "all" }]);
  });

  it("uses the builtin role for a non-member", () => {
    const nonMember = role(["view_time_entries"], { builtin: ROLE_BUILTIN_NON_MEMBER, timeEntriesVisibility: "own" });
    expect(timeEntriesVisibilityRoles({ kind: "non_member", role: nonMember })).toEqual([nonMember]);
  });
});

describe("canAccessTimeEntry", () => {
  it("allows a member with view_time_entries", () => {
    expect(canAccessTimeEntry(entry, context())).toBe(true);
  });

  it("denies when the role lacks view_time_entries", () => {
    expect(canAccessTimeEntry(entry, context({ actor: { kind: "member", roles: [role(["log_time"])] } }))).toBe(false);
  });

  it("denies on an archived project, even for an admin", () => {
    expect(
      canAccessTimeEntry(entry, context({ actor: { kind: "admin" }, projectContext: project({ isArchived: true }) })),
    ).toBe(false);
  });

  it("still allows reading on a closed project (view_time_entries is a read action)", () => {
    expect(canAccessTimeEntry(entry, context({ projectContext: project({ isActive: false }) }))).toBe(true);
  });

  it("denies when the time_tracking module is disabled", () => {
    expect(canAccessTimeEntry(entry, context({ projectContext: project({ enabledModules: [] }) }))).toBe(false);
  });

  it("denies a non-member role on a private project", () => {
    const actor: AuthorizationActor = {
      kind: "non_member",
      role: role(["view_time_entries"], { builtin: ROLE_BUILTIN_NON_MEMBER }),
    };
    expect(canAccessTimeEntry(entry, context({ actor, projectContext: project({ isPublic: false }) }))).toBe(false);
  });

  it("allows a non-member role on a public project", () => {
    const actor: AuthorizationActor = {
      kind: "non_member",
      role: role(["view_time_entries"], { builtin: ROLE_BUILTIN_NON_MEMBER }),
    };
    expect(canAccessTimeEntry(entry, context({ actor }))).toBe(true);
  });

  it("hides another user's entry from an 'own'-scoped role", () => {
    const actor: AuthorizationActor = {
      kind: "member",
      roles: [role(["view_time_entries"], { timeEntriesVisibility: "own" })],
    };
    expect(canAccessTimeEntry({ userId: "other", issueId: null }, context({ actor }))).toBe(false);
    expect(canAccessTimeEntry({ userId: "me", issueId: null }, context({ actor }))).toBe(true);
  });

  it("hides an entry booked against a private issue the viewer can't see", () => {
    const issueById = new Map([["issue-1", issue({ isPrivate: true, authorId: "other" })]]);
    expect(canAccessTimeEntry({ userId: "me", issueId: "issue-1" }, context({ issueById }))).toBe(false);
  });

  it("shows an entry on a private issue the viewer authored", () => {
    const issueById = new Map([["issue-1", issue({ isPrivate: true, authorId: "me" })]]);
    expect(canAccessTimeEntry({ userId: "me", issueId: "issue-1" }, context({ issueById }))).toBe(true);
  });

  it("treats an issue missing from the lookup as not visible", () => {
    expect(canAccessTimeEntry({ userId: "me", issueId: "issue-9" }, context())).toBe(false);
  });

  it("filters a list with the same rule", () => {
    const actor: AuthorizationActor = {
      kind: "member",
      roles: [role(["view_time_entries"], { timeEntriesVisibility: "own" })],
    };
    const entries = [
      { userId: "me", issueId: null },
      { userId: "other", issueId: null },
    ];
    expect(filterAccessibleTimeEntries(entries, context({ actor }))).toEqual([{ userId: "me", issueId: null }]);
  });
});

describe("canAttachIssueToTimeEntry", () => {
  const base = { userId: "me", actor: { kind: "member", roles: [role(["log_time", "view_time_entries"])] } as AuthorizationActor, userGroupIds: [], projectContext: project() };

  it("accepts a visible issue in the same project", () => {
    expect(canAttachIssueToTimeEntry(issue(), "proj-1", base)).toBe(true);
  });

  it("rejects a missing issue", () => {
    expect(canAttachIssueToTimeEntry(null, "proj-1", base)).toBe(false);
  });

  it("rejects an issue from another project", () => {
    expect(canAttachIssueToTimeEntry(issue({ projectId: "other" }), "proj-1", base)).toBe(false);
  });

  it("rejects a private issue the actor can't see", () => {
    expect(canAttachIssueToTimeEntry(issue({ isPrivate: true, authorId: "other" }), "proj-1", base)).toBe(false);
  });

  it("rejects when the actor can edit entries but has no log_time", () => {
    const actor: AuthorizationActor = { kind: "member", roles: [role(["view_time_entries", "edit_time_entries"])] };
    expect(canAttachIssueToTimeEntry(issue(), "proj-1", { ...base, actor })).toBe(false);
  });
});

describe("canAttributeTimeEntryTo", () => {
  const base = { authorId: "author", assignableUserIds: ["author", "colleague"], canLogTimeForOtherUsers: false };

  it("allows an unchanged attribution without any permission", () => {
    expect(canAttributeTimeEntryTo({ ...base, changed: false, requestedUserId: "someone-else" })).toBe(true);
  });

  it("allows attributing to the author without the permission (the create case)", () => {
    expect(canAttributeTimeEntryTo({ ...base, changed: true, requestedUserId: "author" })).toBe(true);
  });

  it("refuses a third party without log_time_for_other_users", () => {
    expect(canAttributeTimeEntryTo({ ...base, changed: true, requestedUserId: "colleague" })).toBe(false);
  });

  it("allows a third party with the permission when they are assignable", () => {
    expect(
      canAttributeTimeEntryTo({ ...base, changed: true, requestedUserId: "colleague", canLogTimeForOtherUsers: true }),
    ).toBe(true);
  });

  it("refuses a third party who is not assignable, even with the permission", () => {
    expect(
      canAttributeTimeEntryTo({ ...base, changed: true, requestedUserId: "stranger", canLogTimeForOtherUsers: true }),
    ).toBe(false);
  });
});

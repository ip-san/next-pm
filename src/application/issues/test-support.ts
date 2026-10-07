import { mock } from "bun:test";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { IssueCategory } from "@/domain/issue-category/entity";
import type { Member } from "@/domain/member/entity";
import type { Project } from "@/domain/project/entity";
import type { Role } from "@/domain/role/entity";
import type { User } from "@/domain/user/entity";
import type { Version } from "@/domain/version/entity";
import type { IssueStatusRepository } from "@/domain/issue-status/repository";
import type { SettingsRepository } from "@/domain/settings/repository";
import type { IssueAttributeRepositories } from "./validate-issue-attributes";

/**
 * Repositories for `assertIssueAttributesAssignable`, stocked with the ids the issue
 * use-case tests use so an unrelated test isn't rejected for an unknown tracker or
 * priority. Tests that exercise the rules themselves pass their own allow-lists.
 */
export function makeIssueAttributeRepositoriesMock(
  allow: {
    trackerIds?: string[];
    priorityIds?: string[];
    categoryIds?: string[];
    versionIds?: string[];
    members?: Pick<Member, "userId" | "groupId" | "roleIds">[];
    roles?: Pick<Role, "id" | "assignable">[];
    users?: Pick<User, "id" | "status">[];
  } = {},
): IssueAttributeRepositories {
  const trackerIds = allow.trackerIds ?? ["tracker-1", "tracker-2"];
  const priorityIds = allow.priorityIds ?? ["normal", "priority-1", "high"];
  const categoryIds = allow.categoryIds ?? [];
  const versionIds = allow.versionIds ?? [];
  // Default membership: the principals the issue use-case tests assign to, all through one
  // assignable role, all active. A test about the assignability rule itself overrides these.
  const defaultUserIds = ["user-1", "user-2", "user-3"];
  const defaultGroupIds = ["group-1", "group-2"];
  const members =
    allow.members ??
    [
      ...defaultUserIds.map((userId) => ({ userId, groupId: null, roleIds: ["role-assignable"] })),
      ...defaultGroupIds.map((groupId) => ({ userId: null, groupId, roleIds: ["role-assignable"] })),
    ];
  const roles = allow.roles ?? [{ id: "role-assignable", assignable: true }];
  const users = allow.users ?? defaultUserIds.map((id) => ({ id, status: "active" as const }));

  return {
    projectRepository: {
      findById: mock(async () => ({ trackerIds }) as unknown as Project),
    } as unknown as IssueAttributeRepositories["projectRepository"],
    memberRepository: {
      listByProject: mock(async () => members as Member[]),
    } as unknown as IssueAttributeRepositories["memberRepository"],
    roleRepository: {
      findByIds: mock(async () => roles as Role[]),
    } as unknown as IssueAttributeRepositories["roleRepository"],
    userRepository: {
      findByIds: mock(async () => users as User[]),
    } as unknown as IssueAttributeRepositories["userRepository"],
    enumerationRepository: {
      listByType: mock(async () => priorityIds.map((id) => ({ id }) as Enumeration)),
    } as unknown as IssueAttributeRepositories["enumerationRepository"],
    issueCategoryRepository: {
      listByProject: mock(async () => categoryIds.map((id) => ({ id }) as IssueCategory)),
    } as unknown as IssueAttributeRepositories["issueCategoryRepository"],
    versionRepository: {
      listSharedWith: mock(async () => versionIds.map((id) => ({ id }) as Version)),
    } as unknown as IssueAttributeRepositories["versionRepository"],
  };
}

/**
 * The extra ports `recalculateParents` needs. Settings default to "independent", so the
 * rollup is a no-op unless a test opts in — which keeps it out of the way of every test
 * that is about something else.
 */
export function makeRollupRepositoriesMock(settings: Record<string, string> = {}) {
  return {
    issueStatusRepository: {
      findById: mock(async () => null),
      listAll: mock(async () => []),
      create: mock(async () => {
        throw new Error("not used");
      }),
    } as unknown as IssueStatusRepository,
    settingsRepository: {
      getAll: mock(async () => settings),
      setMany: mock(async () => undefined),
    } as unknown as SettingsRepository,
  };
}

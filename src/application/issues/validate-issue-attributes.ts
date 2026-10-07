import { assignablePrincipalIds } from "@/domain/issue/assignee";
import type { EnumerationRepository } from "@/domain/enumeration/repository";
import type { IssueCategoryRepository } from "@/domain/issue-category/repository";
import type { MemberRepository } from "@/domain/member/repository";
import type { ProjectRepository } from "@/domain/project/repository";
import type { RoleRepository } from "@/domain/role/repository";
import type { UserRepository } from "@/domain/user/repository";
import type { VersionRepository } from "@/domain/version/repository";

export type IssueAttributeField = "trackerId" | "priorityId" | "assignedToId" | "categoryId" | "fixedVersionId";

export class IssueAttributeNotAssignableError extends Error {
  constructor(public readonly field: IssueAttributeField) {
    super(`"${field}" is not an assignable value for this issue's project.`);
    this.name = "IssueAttributeNotAssignableError";
  }
}

export interface IssueAttributeRepositories {
  projectRepository: ProjectRepository;
  memberRepository: MemberRepository;
  roleRepository: RoleRepository;
  userRepository: UserRepository;
  enumerationRepository: EnumerationRepository;
  issueCategoryRepository: IssueCategoryRepository;
  versionRepository: VersionRepository;
}

/**
 * The attributes whose value has to belong to the issue's project. Each is optional: only
 * the keys actually present are checked, so an update validates what it changes and nothing
 * else (mirroring Redmine's `_changed?`-guarded validations — re-checking an unchanged value
 * would make an issue whose assignee left the project impossible to save).
 */
export interface IssueAttributeCandidate {
  trackerId?: string;
  priorityId?: string;
  assignedTo?: { id: string; type: "user" | "group" } | null;
  categoryId?: string | null;
  fixedVersionId?: string | null;
}

/**
 * Single home for "does this id belong to this project?", shared by `createIssue` and
 * `updateIssue` so every entry point — the two form actions, REST POST/PATCH, bulk edit,
 * CSV import and the mail handler — enforces the same rules. Previously each interface
 * re-implemented a subset: the REST routes never checked the category at all, accepted any
 * existing user as the assignee rather than an assignable project member, and took any
 * `enumerations` row as the priority (the column's FK doesn't distinguish an IssuePriority
 * from a TimeEntryActivity).
 *
 * Mirrors the `validate_issue` family in Redmine's Issue model, which lives on the model
 * precisely so no controller can skip it.
 */
export async function assertIssueAttributesAssignable(
  repositories: IssueAttributeRepositories,
  input: {
    projectId: string;
    /** Feeds Redmine's "the author is always assignable" rule. */
    authorId: string | null;
    /** Who the issue is assigned to *before* this change; stays assignable. Null on create. */
    currentAssignee: { id: string; type: "user" | "group" } | null;
    candidate: IssueAttributeCandidate;
  },
): Promise<void> {
  const { candidate } = input;

  if (candidate.trackerId !== undefined) {
    const project = await repositories.projectRepository.findById(input.projectId);
    if (!project?.trackerIds.includes(candidate.trackerId)) {
      throw new IssueAttributeNotAssignableError("trackerId");
    }
  }

  if (candidate.priorityId !== undefined) {
    // Mirrors Redmine's `belongs_to :priority, class_name: 'IssuePriority'` — the column's
    // own FK only reaches `enumerations`, which also holds activities and doc categories.
    const priorities = await repositories.enumerationRepository.listByType("IssuePriority");
    if (!priorities.some((priority) => priority.id === candidate.priorityId)) {
      throw new IssueAttributeNotAssignableError("priorityId");
    }
  }

  if (candidate.assignedTo !== undefined && candidate.assignedTo !== null) {
    const assignee = candidate.assignedTo;
    const members = await repositories.memberRepository.listByProject(input.projectId);
    const [roles, users] = await Promise.all([
      repositories.roleRepository.findByIds([...new Set(members.flatMap((member) => member.roleIds))]),
      repositories.userRepository.findByIds([
        ...new Set([...members.flatMap((member) => (member.userId ? [member.userId] : [])), ...(input.authorId ? [input.authorId] : [])]),
      ]),
    ]);
    const { userIds, groupIds } = assignablePrincipalIds(
      members,
      new Map(roles.map((role) => [role.id, role])),
      new Map(users.map((user) => [user.id, user.status])),
      { authorId: input.authorId, currentAssignee: input.currentAssignee },
    );
    const offerable = assignee.type === "group" ? groupIds : userIds;
    if (!offerable.has(assignee.id)) {
      throw new IssueAttributeNotAssignableError("assignedToId");
    }
  }

  if (candidate.categoryId) {
    const categories = await repositories.issueCategoryRepository.listByProject(input.projectId);
    if (!categories.some((category) => category.id === candidate.categoryId)) {
      throw new IssueAttributeNotAssignableError("categoryId");
    }
  }

  if (candidate.fixedVersionId) {
    // Mirrors Redmine's Issue#validate_fixed_version — a version is assignable if it's
    // shared with (not just owned by) this issue's project, per its sharing setting.
    const sharedVersions = await repositories.versionRepository.listSharedWith(input.projectId);
    if (!sharedVersions.some((version) => version.id === candidate.fixedVersionId)) {
      throw new IssueAttributeNotAssignableError("fixedVersionId");
    }
  }
}

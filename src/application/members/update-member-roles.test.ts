import { describe, expect, it, mock } from "bun:test";
import type { AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { Member } from "@/domain/member/entity";
import type { MemberAdminRepository, MemberRepository } from "@/domain/member/repository";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";
import type { Role } from "@/domain/role/entity";
import type { RoleRepository } from "@/domain/role/repository";
import {
  MemberRolesEmptyError,
  MemberRolesInvalidError,
  updateMemberRoles,
  UpdateMemberRolesNotPermittedError,
} from "./update-member-roles";

const project: Project = {
  id: "proj-1",
  name: "Alpha",
  identifier: "alpha",
  description: "",
  isPublic: true,
  status: "active",
  parentId: null,
  lft: 1,
  rgt: 2,
  position: 0,
  enabledModules: [],
  trackerIds: [],
};

function member(overrides: Partial<Member> = {}): Member {
  return { id: "member-1", userId: "user-1", groupId: null, inheritedFromMemberId: null, projectId: "proj-1", roleIds: ["role-a"], ...overrides };
}

function givableRole(id: string): Role {
  return {
    id,
    name: id,
    builtin: 0,
    position: 0,
    permissions: [],
    issuesVisibility: "default",
    timeEntriesVisibility: "all",
    usersVisibility: "all",
    assignable: true,
  };
}

function makeRepositories(target: Member, membersInProject: Member[] = []) {
  const memberRepository = {
    findById: mock(async () => target),
    listByProject: mock(async () => membersInProject),
  } as unknown as MemberRepository;
  const memberAdminRepository = { replaceRoles: mock(async () => {}) } as unknown as MemberAdminRepository;
  const projectRepository = { findById: mock(async () => project) } as unknown as ProjectRepository;
  const roleRepository = {
    listGivable: mock(async () => [givableRole("role-a"), givableRole("role-b")]),
  } as unknown as RoleRepository;
  return { memberRepository, memberAdminRepository, projectRepository, roleRepository };
}

const manager: AuthorizationActor = {
  kind: "member",
  roles: [{ builtin: 0, permissions: ["manage_members"], issuesVisibility: "all" }],
};
const bystander: AuthorizationActor = {
  kind: "member",
  roles: [{ builtin: 0, permissions: ["view_members"], issuesVisibility: "all" }],
};

describe("updateMemberRoles", () => {
  it("replaces the role set of a direct membership", async () => {
    const repositories = makeRepositories(member());
    await updateMemberRoles(repositories, { memberId: "member-1", roleIds: ["role-b"], actor: manager });
    expect(repositories.memberAdminRepository.replaceRoles).toHaveBeenCalledWith("member-1", ["role-b"]);
  });

  it("refuses an actor without manage_members", async () => {
    const repositories = makeRepositories(member());
    await expect(
      updateMemberRoles(repositories, { memberId: "member-1", roleIds: ["role-b"], actor: bystander }),
    ).rejects.toBeInstanceOf(UpdateMemberRolesNotPermittedError);
    expect(repositories.memberAdminRepository.replaceRoles).not.toHaveBeenCalled();
  });

  it("refuses a group-inherited row, which only the group's membership can change", async () => {
    const repositories = makeRepositories(member({ inheritedFromMemberId: "group-member-1" }));
    await expect(
      updateMemberRoles(repositories, { memberId: "member-1", roleIds: ["role-b"], actor: manager }),
    ).rejects.toBeInstanceOf(UpdateMemberRolesNotPermittedError);
  });

  it("refuses an empty role set", async () => {
    const repositories = makeRepositories(member());
    await expect(updateMemberRoles(repositories, { memberId: "member-1", roleIds: [], actor: manager })).rejects.toBeInstanceOf(
      MemberRolesEmptyError,
    );
  });

  it("refuses a role that is not givable, so the builtin roles cannot be granted", async () => {
    const repositories = makeRepositories(member());
    await expect(
      updateMemberRoles(repositories, { memberId: "member-1", roleIds: ["role-builtin"], actor: manager }),
    ).rejects.toBeInstanceOf(MemberRolesInvalidError);
  });

  it("re-materializes the inherited rows when a group's own membership changes", async () => {
    const groupMember = member({ id: "group-member-1", userId: null, groupId: "group-1" });
    const inheritedA = member({ id: "inh-a", userId: "user-a", inheritedFromMemberId: "group-member-1" });
    const inheritedB = member({ id: "inh-b", userId: "user-b", inheritedFromMemberId: "group-member-1" });
    const unrelated = member({ id: "other", userId: "user-c" });
    const repositories = makeRepositories(groupMember, [groupMember, inheritedA, inheritedB, unrelated]);

    await updateMemberRoles(repositories, { memberId: "group-member-1", roleIds: ["role-b"], actor: manager });

    expect(repositories.memberAdminRepository.replaceRoles).toHaveBeenCalledWith("group-member-1", ["role-b"]);
    expect(repositories.memberAdminRepository.replaceRoles).toHaveBeenCalledWith("inh-a", ["role-b"]);
    expect(repositories.memberAdminRepository.replaceRoles).toHaveBeenCalledWith("inh-b", ["role-b"]);
    expect(repositories.memberAdminRepository.replaceRoles).not.toHaveBeenCalledWith("other", ["role-b"]);
  });
});

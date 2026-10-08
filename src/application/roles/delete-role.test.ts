import { describe, expect, it, mock } from "bun:test";
import { deleteRole, RoleNotDeletableError } from "./delete-role";
import { ROLE_BUILTIN_ANONYMOUS, ROLE_BUILTIN_MEMBER, type Role } from "@/domain/role/entity";
import type { RoleAdminRepository, RoleRepository } from "@/domain/role/repository";

function role(overrides: Partial<Role> = {}): Role {
  return {
    id: "role-1",
    name: "開発者",
    builtin: ROLE_BUILTIN_MEMBER,
    position: 1,
    permissions: [],
    issuesVisibility: "default",
    timeEntriesVisibility: "all",
    usersVisibility: "all",
    assignable: true,
    ...overrides,
  };
}

function makeRepos(found: Role | null, membershipCount: number) {
  const roleRepository = {
    listAll: mock(async () => []),
    findById: mock(async () => found),
    findByIds: mock(async () => []),
    findBuiltinNonMember: mock(async () => role()),
    findBuiltinAnonymous: mock(async () => role()),
    listAssignable: mock(async () => []),
    listGivable: mock(async () => []),
    create: mock(async () => role()),
    updatePermissions: mock(async () => {}),
  } satisfies RoleRepository;
  const roleAdminRepository = {
    update: mock(async () => role()),
    delete: mock(async () => {}),
    countMemberships: mock(async () => membershipCount),
    updatePositions: mock(async () => {}),
  } satisfies RoleAdminRepository;
  return { roleRepository, roleAdminRepository };
}

describe("deleteRole", () => {
  it("deletes an unused ordinary role", async () => {
    const repositories = makeRepos(role(), 0);
    await deleteRole(repositories, "role-1");
    expect(repositories.roleAdminRepository.delete).toHaveBeenCalledWith("role-1");
  });

  it("refuses a builtin role", async () => {
    const repositories = makeRepos(role({ builtin: ROLE_BUILTIN_ANONYMOUS }), 0);
    await expect(deleteRole(repositories, "role-1")).rejects.toThrow(RoleNotDeletableError);
    expect(repositories.roleAdminRepository.delete).not.toHaveBeenCalled();
  });

  it("refuses a role that is still given to a member", async () => {
    const repositories = makeRepos(role(), 3);
    await expect(deleteRole(repositories, "role-1")).rejects.toThrow(RoleNotDeletableError);
    expect(repositories.roleAdminRepository.delete).not.toHaveBeenCalled();
  });

  it("refuses a role that does not exist", async () => {
    const repositories = makeRepos(null, 0);
    await expect(deleteRole(repositories, "role-1")).rejects.toThrow(RoleNotDeletableError);
  });
});

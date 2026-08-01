import { describe, expect, it, mock } from "bun:test";
import { addGroupToProject, addUserToGroup, removeUserFromGroup } from "./group-membership";
import type { Group } from "@/domain/group/entity";
import type { GroupRepository } from "@/domain/group/repository";
import type { Member } from "@/domain/member/entity";
import type { MemberRepository } from "@/domain/member/repository";

function makeGroupRepository(overrides: Partial<GroupRepository> = {}): GroupRepository {
  return {
    create: mock(async (name: string) => ({ id: "group-1", name }) as Group),
    findById: mock(async () => null),
    listAll: mock(async () => []),
    delete: mock(async () => {}),
    addUser: mock(async () => {}),
    removeUser: mock(async () => {}),
    listUserIds: mock(async () => []),
    ...overrides,
  };
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-1",
    userId: null,
    groupId: null,
    inheritedFromMemberId: null,
    projectId: "proj-1",
    roleIds: [],
    ...overrides,
  };
}

function makeMemberRepository(overrides: Partial<MemberRepository> = {}): MemberRepository {
  return {
    findById: mock(async () => null),
    findByUserAndProject: mock(async () => null),
    findDirectByUserAndProject: mock(async () => null),
    listByProject: mock(async () => []),
    listByGroup: mock(async () => []),
    create: mock(async (m) => ({ ...m, id: "new-member" }) as Member),
    delete: mock(async () => {}),
    deleteInherited: mock(async () => {}),
    findInherited: mock(async () => null),
    ...overrides,
  };
}

describe("addGroupToProject", () => {
  it("creates the group membership and one inherited row per group user", async () => {
    const created: Omit<Member, "id">[] = [];
    const memberRepository = makeMemberRepository({
      create: mock(async (m) => {
        created.push(m);
        return { ...m, id: created.length === 1 ? "group-member-1" : `inherited-${created.length}` } as Member;
      }),
    });
    const groupRepository = makeGroupRepository({ listUserIds: mock(async () => ["user-a", "user-b"]) });

    const result = await addGroupToProject({ groupRepository, memberRepository }, { groupId: "group-1", projectId: "proj-1", roleIds: ["role-1"] });

    expect(result.groupId).toBe("group-1");
    expect(created).toHaveLength(3);
    expect(created[0]).toMatchObject({ groupId: "group-1", userId: null, roleIds: ["role-1"] });
    expect(created[1]).toMatchObject({ userId: "user-a", inheritedFromMemberId: "group-member-1", roleIds: ["role-1"] });
    expect(created[2]).toMatchObject({ userId: "user-b", inheritedFromMemberId: "group-member-1", roleIds: ["role-1"] });
  });
});

describe("addUserToGroup", () => {
  it("materializes an inherited row in every project the group is a member of", async () => {
    const created: Omit<Member, "id">[] = [];
    const memberRepository = makeMemberRepository({
      listByGroup: mock(async () => [
        makeMember({ id: "gm-1", groupId: "group-1", projectId: "proj-1", roleIds: ["role-1"] }),
        makeMember({ id: "gm-2", groupId: "group-1", projectId: "proj-2", roleIds: ["role-2"] }),
      ]),
      create: mock(async (m) => {
        created.push(m);
        return { ...m, id: "new" } as Member;
      }),
    });
    const groupRepository = makeGroupRepository();

    await addUserToGroup({ groupRepository, memberRepository }, "group-1", "user-a");

    expect(groupRepository.addUser).toHaveBeenCalledWith("group-1", "user-a");
    expect(created).toEqual([
      { userId: "user-a", groupId: null, inheritedFromMemberId: "gm-1", projectId: "proj-1", roleIds: ["role-1"] },
      { userId: "user-a", groupId: null, inheritedFromMemberId: "gm-2", projectId: "proj-2", roleIds: ["role-2"] },
    ]);
  });

  it("is idempotent when an inherited row already exists for a project", async () => {
    const create = mock(async (m: Omit<Member, "id">) => ({ ...m, id: "new" }) as Member);
    const memberRepository = makeMemberRepository({
      listByGroup: mock(async () => [makeMember({ id: "gm-1", groupId: "group-1", projectId: "proj-1", roleIds: ["role-1"] })]),
      findInherited: mock(async () => makeMember({ id: "existing-inherited", userId: "user-a", inheritedFromMemberId: "gm-1" })),
      create,
    });
    const groupRepository = makeGroupRepository();

    await addUserToGroup({ groupRepository, memberRepository }, "group-1", "user-a");

    expect(create).not.toHaveBeenCalled();
  });
});

describe("removeUserFromGroup", () => {
  it("removes the inherited row for every project the group is a member of", async () => {
    const memberRepository = makeMemberRepository({
      listByGroup: mock(async () => [
        makeMember({ id: "gm-1", groupId: "group-1", projectId: "proj-1" }),
        makeMember({ id: "gm-2", groupId: "group-1", projectId: "proj-2" }),
      ]),
    });
    const groupRepository = makeGroupRepository();

    await removeUserFromGroup({ groupRepository, memberRepository }, "group-1", "user-a");

    expect(groupRepository.removeUser).toHaveBeenCalledWith("group-1", "user-a");
    expect(memberRepository.deleteInherited).toHaveBeenCalledWith("gm-1", "user-a");
    expect(memberRepository.deleteInherited).toHaveBeenCalledWith("gm-2", "user-a");
  });
});

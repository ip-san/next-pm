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
    listGroupIdsForUser: mock(async () => []),
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
    createMany: mock(async (ms: Omit<Member, "id">[]) => ms.map((m, i) => ({ ...m, id: `new-member-${i}` }) as Member)),
    delete: mock(async () => {}),
    deleteInherited: mock(async () => {}),
    deleteManyInherited: mock(async () => {}),
    findInherited: mock(async () => null),
    ...overrides,
  };
}

describe("addGroupToProject", () => {
  it("creates the group membership then one inherited row per group user in a single batch", async () => {
    const memberRepository = makeMemberRepository({
      create: mock(async (m) => ({ ...m, id: "group-member-1" }) as Member),
    });
    const groupRepository = makeGroupRepository({ listUserIds: mock(async () => ["user-a", "user-b"]) });

    const result = await addGroupToProject({ groupRepository, memberRepository }, { groupId: "group-1", projectId: "proj-1", roleIds: ["role-1"] });

    expect(result.groupId).toBe("group-1");
    expect(memberRepository.createMany).toHaveBeenCalledWith([
      { userId: "user-a", groupId: null, inheritedFromMemberId: "group-member-1", projectId: "proj-1", roleIds: ["role-1"] },
      { userId: "user-b", groupId: null, inheritedFromMemberId: "group-member-1", projectId: "proj-1", roleIds: ["role-1"] },
    ]);
  });

  it("skips the batch call when the group has no users", async () => {
    const memberRepository = makeMemberRepository({ create: mock(async (m) => ({ ...m, id: "group-member-1" }) as Member) });
    const groupRepository = makeGroupRepository({ listUserIds: mock(async () => []) });

    await addGroupToProject({ groupRepository, memberRepository }, { groupId: "group-1", projectId: "proj-1", roleIds: ["role-1"] });

    expect(memberRepository.createMany).not.toHaveBeenCalled();
  });
});

describe("addUserToGroup", () => {
  it("materializes an inherited row in every project the group is a member of, in one batch", async () => {
    const memberRepository = makeMemberRepository({
      listByGroup: mock(async () => [
        makeMember({ id: "gm-1", groupId: "group-1", projectId: "proj-1", roleIds: ["role-1"] }),
        makeMember({ id: "gm-2", groupId: "group-1", projectId: "proj-2", roleIds: ["role-2"] }),
      ]),
    });
    const groupRepository = makeGroupRepository();

    await addUserToGroup({ groupRepository, memberRepository }, "group-1", "user-a");

    expect(groupRepository.addUser).toHaveBeenCalledWith("group-1", "user-a");
    expect(memberRepository.createMany).toHaveBeenCalledWith([
      { userId: "user-a", groupId: null, inheritedFromMemberId: "gm-1", projectId: "proj-1", roleIds: ["role-1"] },
      { userId: "user-a", groupId: null, inheritedFromMemberId: "gm-2", projectId: "proj-2", roleIds: ["role-2"] },
    ]);
  });

  it("is idempotent when an inherited row already exists for a project", async () => {
    const memberRepository = makeMemberRepository({
      listByGroup: mock(async () => [makeMember({ id: "gm-1", groupId: "group-1", projectId: "proj-1", roleIds: ["role-1"] })]),
      findInherited: mock(async () => makeMember({ id: "existing-inherited", userId: "user-a", inheritedFromMemberId: "gm-1" })),
    });
    const groupRepository = makeGroupRepository();

    await addUserToGroup({ groupRepository, memberRepository }, "group-1", "user-a");

    expect(memberRepository.createMany).not.toHaveBeenCalled();
  });
});

describe("removeUserFromGroup", () => {
  it("revokes access (batched) before removing the group_users row", async () => {
    const calls: string[] = [];
    const memberRepository = makeMemberRepository({
      listByGroup: mock(async () => [
        makeMember({ id: "gm-1", groupId: "group-1", projectId: "proj-1" }),
        makeMember({ id: "gm-2", groupId: "group-1", projectId: "proj-2" }),
      ]),
      deleteManyInherited: mock(async () => {
        calls.push("deleteManyInherited");
      }),
    });
    const groupRepository = makeGroupRepository({
      removeUser: mock(async () => {
        calls.push("removeUser");
      }),
    });

    await removeUserFromGroup({ groupRepository, memberRepository }, "group-1", "user-a");

    expect(memberRepository.deleteManyInherited).toHaveBeenCalledWith([
      { groupMemberId: "gm-1", userId: "user-a" },
      { groupMemberId: "gm-2", userId: "user-a" },
    ]);
    expect(calls).toEqual(["deleteManyInherited", "removeUser"]);
  });
});

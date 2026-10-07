import { describe, expect, it, mock } from "bun:test";
import { listAssignableTimeEntryUsers } from "./assignable-users";
import type { Member } from "@/domain/member/entity";
import type { MemberRepository } from "@/domain/member/repository";
import type { Role } from "@/domain/role/entity";
import type { RoleRepository } from "@/domain/role/repository";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

function user(id: string, login: string, status: User["status"] = "active"): User {
  return { id, login, lastname: "L", firstname: "F", status } as User;
}

function role(id: string, permissions: Role["permissions"]): Role {
  return { id, permissions } as Role;
}

function makeRepos(options: { members: Member[]; roles: Role[]; users: User[] }) {
  const memberRepository = {
    listByProject: mock(async () => options.members),
  } as unknown as MemberRepository;
  const roleRepository = {
    findByIds: mock(async (ids: string[]) => options.roles.filter((r) => ids.includes(r.id))),
  } as unknown as RoleRepository;
  const userRepository = {
    findByIds: mock(async (ids: string[]) => options.users.filter((u) => ids.includes(u.id))),
  } as unknown as UserRepository;
  return { memberRepository, roleRepository, userRepository };
}

const member = (userId: string | null, roleIds: string[], groupId: string | null = null): Member => ({
  id: `m-${userId ?? groupId}`,
  userId,
  groupId,
  inheritedFromMemberId: null,
  projectId: "proj-1",
  roleIds,
});

describe("listAssignableTimeEntryUsers", () => {
  const logger = role("role-logger", ["log_time"]);
  const reader = role("role-reader", ["view_time_entries"]);

  it("includes members whose role grants log_time", async () => {
    const repos = makeRepos({
      members: [member("u-1", ["role-logger"])],
      roles: [logger],
      users: [user("u-1", "alice")],
    });
    const result = await listAssignableTimeEntryUsers(repos, "proj-1", user("me", "me"));
    expect(result.map((u) => u.login).sort()).toEqual(["alice", "me"]);
  });

  it("excludes members whose roles don't grant log_time", async () => {
    const repos = makeRepos({
      members: [member("u-1", ["role-reader"])],
      roles: [logger, reader],
      users: [user("u-1", "alice")],
    });
    const result = await listAssignableTimeEntryUsers(repos, "proj-1", user("me", "me"));
    expect(result.map((u) => u.login)).toEqual(["me"]);
  });

  it("excludes locked accounts", async () => {
    const repos = makeRepos({
      members: [member("u-1", ["role-logger"])],
      roles: [logger],
      users: [user("u-1", "alice", "locked")],
    });
    const result = await listAssignableTimeEntryUsers(repos, "proj-1", user("me", "me"));
    expect(result.map((u) => u.login)).toEqual(["me"]);
  });

  it("always includes the current user, member or not", async () => {
    const repos = makeRepos({ members: [], roles: [], users: [] });
    const result = await listAssignableTimeEntryUsers(repos, "proj-1", user("me", "me"));
    expect(result.map((u) => u.id)).toEqual(["me"]);
  });

  it("doesn't list the current user twice when they are also a member", async () => {
    const repos = makeRepos({
      members: [member("me", ["role-logger"])],
      roles: [logger],
      users: [user("me", "me")],
    });
    const result = await listAssignableTimeEntryUsers(repos, "proj-1", user("me", "me"));
    expect(result).toHaveLength(1);
  });

  it("skips group principal rows, which carry no user of their own", async () => {
    const repos = makeRepos({
      members: [member(null, ["role-logger"], "g-1")],
      roles: [logger],
      users: [],
    });
    const result = await listAssignableTimeEntryUsers(repos, "proj-1", user("me", "me"));
    expect(result.map((u) => u.id)).toEqual(["me"]);
  });
});

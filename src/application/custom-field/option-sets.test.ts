import { describe, expect, it, mock } from "bun:test";
import { loadCustomFieldOptionSets, type CustomFieldOptionRepositories } from "./option-sets";
import type { User } from "@/domain/user/entity";

function repositories(users: Partial<User>[]): CustomFieldOptionRepositories {
  return {
    memberRepository: { listByProject: mock(async () => users.map((user) => ({ userId: user.id, groupId: null, roleIds: [] }))) } as never,
    userRepository: { findByIds: mock(async () => users as User[]) } as never,
    versionRepository: { listSharedWith: mock(async () => [{ id: "v-1" }, { id: "v-2" }]) } as never,
  };
}

describe("loadCustomFieldOptionSets", () => {
  it("offers only active members to a user field", async () => {
    const sets = await loadCustomFieldOptionSets(
      repositories([
        { id: "u-active", status: "active" },
        { id: "u-locked", status: "locked" },
      ]),
      "project-1",
      [{ id: "f-user", fieldFormat: "user" }],
    );
    expect([...sets["f-user"]]).toEqual(["u-active"]);
  });

  it("offers the shared versions to a version field, and nothing to other formats", async () => {
    const sets = await loadCustomFieldOptionSets(repositories([]), "project-1", [
      { id: "f-version", fieldFormat: "version" },
      { id: "f-text", fieldFormat: "string" },
    ]);
    expect([...sets["f-version"]]).toEqual(["v-1", "v-2"]);
    expect(sets["f-text"]).toBeUndefined();
  });
});

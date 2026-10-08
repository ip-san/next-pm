import { describe, expect, it } from "bun:test";
import { canSeeUser, viewAllActiveUsers, type UserVisibilityScope } from "./visibility";

const members = new Set(["member-1"]);
const scope = (overrides: Partial<UserVisibilityScope>): UserVisibilityScope => ({
  viewerId: "viewer",
  isAdmin: false,
  viewAllActive: false,
  membersOfVisibleProjects: members,
  ...overrides,
});

describe("viewAllActiveUsers", () => {
  it("is true when any governing role has users_visibility = all", () => {
    expect(viewAllActiveUsers([{ usersVisibility: "members_of_visible_projects" }, { usersVisibility: "all" }])).toBe(true);
    expect(viewAllActiveUsers([{ usersVisibility: "members_of_visible_projects" }])).toBe(false);
    expect(viewAllActiveUsers([])).toBe(false);
  });
});

describe("canSeeUser", () => {
  it("lets an administrator see anyone", () => {
    expect(canSeeUser(scope({ isAdmin: true }), "stranger")).toBe(true);
  });

  it("lets a viewer with users_visibility = all see anyone", () => {
    expect(canSeeUser(scope({ viewAllActive: true }), "stranger")).toBe(true);
  });

  it("lets a restricted viewer see only themselves and members of visible projects", () => {
    expect(canSeeUser(scope({}), "viewer")).toBe(true);
    expect(canSeeUser(scope({}), "member-1")).toBe(true);
    expect(canSeeUser(scope({}), "stranger")).toBe(false);
  });

  it("never treats an anonymous viewer as the user with a null id", () => {
    expect(canSeeUser(scope({ viewerId: null }), "stranger")).toBe(false);
  });
});

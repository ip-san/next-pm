import { describe, expect, it } from "bun:test";
import { ownAccountDeletable } from "./account-deletion";

const plain = { isAdmin: false };
const admin = { isAdmin: true };

describe("ownAccountDeletable", () => {
  it("is false for everyone while the unsubscribe setting is off", () => {
    expect(ownAccountDeletable(plain, false, false)).toBe(false);
    expect(ownAccountDeletable(admin, false, true)).toBe(false);
  });

  it("lets an ordinary user delete their own account", () => {
    expect(ownAccountDeletable(plain, true, false)).toBe(true);
  });

  it("lets an administrator delete their own account only while another active admin remains", () => {
    expect(ownAccountDeletable(admin, true, true)).toBe(true);
    expect(ownAccountDeletable(admin, true, false)).toBe(false);
  });
});

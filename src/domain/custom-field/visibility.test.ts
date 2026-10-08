import { describe, expect, it } from "bun:test";
import { isCustomFieldVisibleTo, normalizeFieldVisibility } from "./visibility";

const restricted = { visible: false, roleIds: ["manager", "developer"] };
const publicField = { visible: true, roleIds: [] };

describe("isCustomFieldVisibleTo", () => {
  it("shows a public field to everyone, including people with no roles", () => {
    expect(isCustomFieldVisibleTo(publicField, { isAdmin: false, roleIds: [] })).toBe(true);
  });

  it("shows a restricted field to an admin whatever their roles", () => {
    expect(isCustomFieldVisibleTo(restricted, { isAdmin: true, roleIds: [] })).toBe(true);
  });

  it("shows a restricted field to a viewer holding one of its roles in the project", () => {
    expect(isCustomFieldVisibleTo(restricted, { isAdmin: false, roleIds: ["developer"] })).toBe(true);
  });

  it("hides a restricted field from a viewer with none of its roles", () => {
    expect(isCustomFieldVisibleTo(restricted, { isAdmin: false, roleIds: ["reporter"] })).toBe(false);
  });

  it("hides a restricted field with no roles from everyone but admins", () => {
    expect(isCustomFieldVisibleTo({ visible: false, roleIds: [] }, { isAdmin: false, roleIds: ["manager"] })).toBe(false);
  });
});

describe("normalizeFieldVisibility", () => {
  it("clears the roles when a field is made public", () => {
    expect(normalizeFieldVisibility({ visible: true, roleIds: ["manager"] })).toEqual({ visible: true, roleIds: [] });
  });

  it("keeps the roles, de-duplicated, when a field is restricted", () => {
    expect(normalizeFieldVisibility({ visible: false, roleIds: ["manager", "manager"] })).toEqual({ visible: false, roleIds: ["manager"] });
  });
});

import { describe, expect, it } from "bun:test";
import type { Enumeration } from "./entity";
import { isOverridingChange, resolveProjectActivities } from "./project-activities";

function activity(id: string, overrides: Partial<Enumeration> = {}): Enumeration {
  return {
    id,
    type: "TimeEntryActivity",
    name: id,
    position: 1,
    isDefault: false,
    active: true,
    projectId: null,
    parentId: null,
    ...overrides,
  };
}

const design = activity("design", { position: 1 });
const development = activity("development", { position: 2 });

describe("resolveProjectActivities", () => {
  it("returns the system activities when the project overrides nothing", () => {
    expect(resolveProjectActivities([design, development], []).map((a) => a.id)).toEqual(["design", "development"]);
  });

  it("substitutes an override in place of its parent rather than appending it", () => {
    const override = activity("override-design", { projectId: "proj-1", parentId: "design", name: "design", position: 1 });
    const resolved = resolveProjectActivities([design, development], [override]);
    expect(resolved.map((a) => a.id)).toEqual(["override-design", "development"]);
  });

  it("drops an activity the project deactivated, unless inactive ones are asked for", () => {
    const off = activity("off-design", { projectId: "proj-1", parentId: "design", active: false });
    expect(resolveProjectActivities([design, development], [off]).map((a) => a.id)).toEqual(["development"]);
    expect(resolveProjectActivities([design, development], [off], { includeInactive: true }).map((a) => a.id)).toEqual([
      "off-design",
      "development",
    ]);
  });

  it("drops a system activity that is inactive system-wide", () => {
    expect(resolveProjectActivities([{ ...design, active: false }, development], []).map((a) => a.id)).toEqual(["development"]);
  });
});

describe("isOverridingChange", () => {
  it("is true only when the desired state differs from the parent's", () => {
    expect(isOverridingChange({ active: true }, { active: false })).toBe(true);
    expect(isOverridingChange({ active: true }, { active: true })).toBe(false);
  });
});

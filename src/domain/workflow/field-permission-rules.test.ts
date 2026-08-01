import { describe, expect, it } from "bun:test";
import { readOnlyAttributeNames, requiredAttributeNames, workflowRuleByAttribute } from "./field-permission-rules";
import type { WorkflowFieldPermission } from "./entity";

function permission(overrides: Partial<WorkflowFieldPermission>): WorkflowFieldPermission {
  return {
    id: "p",
    trackerId: "tracker-1",
    roleId: "role-1",
    statusId: "status-1",
    fieldName: "dueDate",
    rule: "required",
    ...overrides,
  };
}

const baseQuery = { trackerId: "tracker-1", statusId: "status-1", roleIds: ["role-1"] };

describe("workflowRuleByAttribute", () => {
  it("returns nothing when no rows match this tracker/status/role", () => {
    expect(workflowRuleByAttribute([], baseQuery)).toEqual({});
  });

  it("excludes rows for a different tracker or status", () => {
    const rows = [permission({ trackerId: "other-tracker" }), permission({ statusId: "other-status" })];
    expect(workflowRuleByAttribute(rows, baseQuery)).toEqual({});
  });

  it("applies a single role's rule directly", () => {
    const rows = [permission({ rule: "readonly" })];
    expect(workflowRuleByAttribute(rows, baseQuery)).toEqual({ dueDate: "readonly" });
  });

  it("applies the shared rule when every considered role agrees", () => {
    const rows = [
      permission({ roleId: "role-1", rule: "required" }),
      permission({ roleId: "role-2", rule: "required" }),
    ];
    const result = workflowRuleByAttribute(rows, { ...baseQuery, roleIds: ["role-1", "role-2"] });
    expect(result).toEqual({ dueDate: "required" });
  });

  it("resolves disagreement between roles to 'required' (the stricter option)", () => {
    const rows = [
      permission({ roleId: "role-1", rule: "readonly" }),
      permission({ roleId: "role-2", rule: "required" }),
    ];
    const result = workflowRuleByAttribute(rows, { ...baseQuery, roleIds: ["role-1", "role-2"] });
    expect(result).toEqual({ dueDate: "required" });
  });

  it("leaves a field unrestricted when one of the considered roles has no rule for it", () => {
    // role-2 has no row at all for this field/status/tracker combination.
    const rows = [permission({ roleId: "role-1", rule: "readonly" })];
    const result = workflowRuleByAttribute(rows, { ...baseQuery, roleIds: ["role-1", "role-2"] });
    expect(result).toEqual({});
  });

  it("effectively unrestricts an admin's large role set unless every one of those roles has a rule", () => {
    // Mirrors resolveActor's admin branch, which passes every assignable role as roleIds —
    // a rule configured for just one role never satisfies the "every role" requirement.
    const manyRoleIds = ["role-1", "role-2", "role-3", "role-4"];
    const rows = [permission({ roleId: "role-1", rule: "required" })];
    expect(workflowRuleByAttribute(rows, { ...baseQuery, roleIds: manyRoleIds })).toEqual({});
  });

  it("returns nothing when roleIds is empty", () => {
    const rows = [permission({})];
    expect(workflowRuleByAttribute(rows, { ...baseQuery, roleIds: [] })).toEqual({});
  });
});

describe("readOnlyAttributeNames / requiredAttributeNames", () => {
  it("splits fields by resolved rule", () => {
    const rows = [
      permission({ fieldName: "dueDate", rule: "required" }),
      permission({ fieldName: "categoryId", rule: "readonly" }),
    ];
    expect(requiredAttributeNames(rows, baseQuery)).toEqual(["dueDate"]);
    expect(readOnlyAttributeNames(rows, baseQuery)).toEqual(["categoryId"]);
  });
});

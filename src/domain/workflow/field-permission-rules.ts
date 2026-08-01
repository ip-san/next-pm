import { WORKFLOW_ELIGIBLE_FIELDS, type FieldPermissionRule, type WorkflowEligibleField, type WorkflowFieldPermission } from "./entity";

export interface FieldPermissionQuery {
  trackerId: string;
  statusId: string;
  /** Every role the acting user holds that's relevant here (all assignable roles for admin). */
  roleIds: string[];
}

/**
 * Faithful port of Redmine's `Issue#workflow_rule_by_attribute` (`app/models/issue.rb#L709`).
 * A field is restricted only when *every* considered role has some rule for it — if a role
 * has no rule at all, the field is left unrestricted for that user (a broader role "wins" by
 * omission). Among roles that do have a rule, agreement uses that rule; disagreement resolves
 * to `"required"` (the stricter option — silently dropping a field a required-elsewhere role
 * needs would be worse than asking for it).
 */
export function workflowRuleByAttribute(
  permissions: WorkflowFieldPermission[],
  query: FieldPermissionQuery,
): Partial<Record<WorkflowEligibleField, FieldPermissionRule>> {
  const roleIds = new Set(query.roleIds);
  if (roleIds.size === 0) return {};

  const perField = new Map<WorkflowEligibleField, Map<string, FieldPermissionRule>>();
  for (const permission of permissions) {
    if (
      permission.trackerId !== query.trackerId ||
      permission.statusId !== query.statusId ||
      !roleIds.has(permission.roleId)
    ) {
      continue;
    }
    const perRole = perField.get(permission.fieldName) ?? new Map<string, FieldPermissionRule>();
    perRole.set(permission.roleId, permission.rule);
    perField.set(permission.fieldName, perRole);
  }

  const result: Partial<Record<WorkflowEligibleField, FieldPermissionRule>> = {};
  for (const [fieldName, perRole] of perField) {
    if (perRole.size < roleIds.size) continue;
    const rules = new Set(perRole.values());
    result[fieldName] = rules.size === 1 ? [...rules][0] : "required";
  }
  return result;
}

export function readOnlyAttributeNames(
  permissions: WorkflowFieldPermission[],
  query: FieldPermissionQuery,
): WorkflowEligibleField[] {
  const rules = workflowRuleByAttribute(permissions, query);
  return WORKFLOW_ELIGIBLE_FIELDS.filter((field) => rules[field] === "readonly");
}

export function requiredAttributeNames(
  permissions: WorkflowFieldPermission[],
  query: FieldPermissionQuery,
): WorkflowEligibleField[] {
  const rules = workflowRuleByAttribute(permissions, query);
  return WORKFLOW_ELIGIBLE_FIELDS.filter((field) => rules[field] === "required");
}

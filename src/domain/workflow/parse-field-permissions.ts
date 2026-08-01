import { WORKFLOW_ELIGIBLE_FIELDS, type FieldPermissionRule, type WorkflowEligibleField } from "./entity";

export interface ParsedFieldPermissionCell {
  statusId: string;
  fieldName: WorkflowEligibleField;
  rule: FieldPermissionRule;
}

const ELIGIBLE_FIELD_NAMES: ReadonlySet<string> = new Set(WORKFLOW_ELIGIBLE_FIELDS);

function isFieldPermissionRule(value: string): value is FieldPermissionRule {
  return value === "readonly" || value === "required";
}

/**
 * Parses the admin workflow field-permissions grid's FormData entries. Cell name convention:
 * `perm:<statusId>:<fieldName>` — uuids contain no colons, so a plain split is unambiguous
 * (mirrors the transitions checkbox's `oldId:newId` convention). Entries with any other key
 * prefix, or an empty value (the "editable" default option), are ignored rather than rejected.
 */
export function parseFieldPermissionEntries(
  entries: Array<[string, string]>,
  validStatusIds: ReadonlySet<string>,
): { ok: true; permissions: ParsedFieldPermissionCell[] } | { ok: false; error: string } {
  const permissions: ParsedFieldPermissionCell[] = [];
  for (const [key, value] of entries) {
    if (!key.startsWith("perm:") || value.length === 0) continue;
    const [, statusId, fieldName] = key.split(":");
    if (
      !statusId ||
      !fieldName ||
      !validStatusIds.has(statusId) ||
      !ELIGIBLE_FIELD_NAMES.has(fieldName) ||
      !isFieldPermissionRule(value)
    ) {
      return { ok: false, error: "不正な入力が指定されました。" };
    }
    permissions.push({ statusId, fieldName: fieldName as WorkflowEligibleField, rule: value });
  }
  return { ok: true, permissions };
}

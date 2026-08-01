/**
 * Mirrors Rails' `Object#blank?` closely enough for the field types `WORKFLOW_ELIGIBLE_FIELDS`
 * covers: null/undefined and whitespace-only strings are blank. Numbers (`doneRatio`,
 * `estimatedHours`) and booleans (`isPrivate`) are never blank once present — `0` and `false`
 * are valid, deliberate values, not missing ones.
 */
export function isFieldBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

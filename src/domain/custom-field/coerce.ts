import type { CustomField } from "./entity";
import { CUSTOM_VALUE_SEPARATOR } from "@/domain/custom-value/separator";

export type CoerceResult = { ok: true; value: string | null } | { ok: false; error: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The ids a `user` or `version` field may take, per field, for one project: Redmine's
 * `possible_values_options` for that object. A field missing from the map has no options to
 * check against, so any value for it is refused (fail closed).
 */
export type CustomFieldOptionSets = Record<string, ReadonlySet<string>>;

/**
 * Validates and normalizes a raw string input against a CustomField's format, mirroring
 * Redmine::FieldFormat's per-format `validate_single_value`/`casted_value` (field_format.rb).
 * CustomValue.value is always stored as text regardless of format — this is the one place
 * that text gets format-checked before being written.
 */
export function coerceCustomFieldValue(
  field: Pick<CustomField, "name" | "fieldFormat" | "isRequired" | "possibleValues"> & { multiple?: boolean },
  raw: string,
  allowedIds?: ReadonlySet<string>,
): CoerceResult {
  if (!field.multiple) {
    return coerceSingleValue(field, raw, allowedIds);
  }
  // Several values travel one per line (see CUSTOM_VALUE_SEPARATOR). Each one is checked on its own, duplicates
  // collapse, and an empty list is the empty value (or a required-field error).
  const items = [...new Set(raw.split(CUSTOM_VALUE_SEPARATOR).map((item) => item.trim()).filter((item) => item !== ""))];
  if (items.length === 0) {
    return coerceSingleValue(field, "", allowedIds);
  }
  const checked: string[] = [];
  for (const item of items) {
    const result = coerceSingleValue(field, item, allowedIds);
    if (!result.ok) return result;
    if (result.value !== null) checked.push(result.value);
  }
  // Stored in one fixed order, so the same selection always reads and compares the same way.
  return { ok: true, value: checked.sort().join(CUSTOM_VALUE_SEPARATOR) };
}

function coerceSingleValue(
  field: Pick<CustomField, "name" | "fieldFormat" | "isRequired" | "possibleValues">,
  raw: string,
  allowedIds?: ReadonlySet<string>,
): CoerceResult {
  const trimmed = raw.trim();

  if (trimmed === "") {
    if (field.isRequired) {
      return { ok: false, error: `"${field.name}"は必須項目です。` };
    }
    return { ok: true, value: null };
  }

  switch (field.fieldFormat) {
    case "string":
    case "text":
    case "link":
      return { ok: true, value: raw };

    case "int":
      return /^-?\d+$/.test(trimmed) ? { ok: true, value: trimmed } : { ok: false, error: "整数を入力してください。" };

    case "float":
      return Number.isFinite(Number(trimmed)) ? { ok: true, value: trimmed } : { ok: false, error: "数値を入力してください。" };

    case "date":
      return DATE_PATTERN.test(trimmed) && !Number.isNaN(Date.parse(trimmed))
        ? { ok: true, value: trimmed }
        : { ok: false, error: "日付はYYYY-MM-DD形式で入力してください。" };

    case "bool":
      return trimmed === "0" || trimmed === "1"
        ? { ok: true, value: trimmed }
        : { ok: false, error: "true/falseの値を指定してください。" };

    case "list":
      return field.possibleValues.includes(trimmed)
        ? { ok: true, value: trimmed }
        : { ok: false, error: `"${trimmed}"は許可された値ではありません。` };

    case "user":
    case "version":
    case "enumeration":
      // Redmine's UserFormat / VersionFormat / EnumerationFormat accept only a record the project offers.
      return UUID_PATTERN.test(trimmed) && allowedIds?.has(trimmed)
        ? { ok: true, value: trimmed }
        : { ok: false, error: "候補から選択してください。" };
  }
}

export interface CustomFieldValidation {
  fieldErrors: Record<string, string>;
  coerced: { customFieldId: string; value: string | null }[];
}

type ValidatableField = Pick<CustomField, "id" | "name" | "fieldFormat" | "isRequired" | "possibleValues"> & { multiple?: boolean };

/**
 * Pure validate-only counterpart to setIssueCustomFieldValues — runs the same per-field
 * coercion without touching any repository, so a caller can reject an entirely invalid
 * submission (e.g. at issue-create time) before persisting anything else.
 */
export function validateCustomFieldValues(
  fields: ValidatableField[],
  rawValues: Record<string, string>,
  optionSets: CustomFieldOptionSets = {},
): CustomFieldValidation {
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const fieldErrors: Record<string, string> = {};
  const coerced: { customFieldId: string; value: string | null }[] = [];

  for (const [customFieldId, raw] of Object.entries(rawValues)) {
    const field = fieldById.get(customFieldId);
    if (!field) continue; // not applicable to this tracker — silently ignored, not an error

    const result = coerceCustomFieldValue(field, raw, optionSets[customFieldId]);
    if (!result.ok) {
      fieldErrors[customFieldId] = result.error;
    } else {
      coerced.push({ customFieldId, value: result.value });
    }
  }

  return { fieldErrors, coerced };
}

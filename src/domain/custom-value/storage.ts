import { CUSTOM_VALUE_SEPARATOR } from "./separator";

/**
 * The rows a field's value is stored as. A multiple-valued field keeps one row per value, split on the separator.
 * Any other field keeps its value whole, so a multi-line text value round-trips byte for byte.
 */
export function storedRowsFor(multiple: boolean, value: string | null): string[] {
  if (value === null || value === "") return [];
  if (!multiple) return [value];
  return value.split(CUSTOM_VALUE_SEPARATOR).filter((item) => item.length > 0);
}

/** The value a field reads back as from its stored rows: the rows joined by the separator, or null when none. */
export function valueFromStoredRows(rows: string[]): string | null {
  return rows.length > 0 ? rows.join(CUSTOM_VALUE_SEPARATOR) : null;
}

/** Two stored values hold the same set of values, whatever order they list them in. */
export function sameCustomValue(a: string | null, b: string | null): boolean {
  const normalize = (value: string | null) =>
    value === null || value === "" ? "" : value.split(CUSTOM_VALUE_SEPARATOR).sort().join(CUSTOM_VALUE_SEPARATOR);
  return normalize(a) === normalize(b);
}

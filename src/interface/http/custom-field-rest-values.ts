import { z } from "zod";
import { CUSTOM_VALUE_SEPARATOR } from "@/domain/custom-value/separator";

/**
 * Turns the REST body's custom field values into the one-string-per-field shape the application takes. A
 * multiple-valued field can be sent as a JSON array; the entries join one per line, as they are stored.
 */
export function normalizeRestCustomFieldValues(values: Record<string, string | string[]>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([fieldId, value]) => [
      fieldId,
      Array.isArray(value) ? value.filter((entry) => entry.trim() !== "").join(CUSTOM_VALUE_SEPARATOR) : value,
    ]),
  );
}

/** `custom_field_values` in a REST request body: a string per field, or an array for a multiple-valued one. */
export const restCustomFieldValuesSchema = z
  .record(z.string(), z.union([z.string(), z.array(z.string())]))
  .default({})
  .transform(normalizeRestCustomFieldValues);

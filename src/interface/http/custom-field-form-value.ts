import { CUSTOM_VALUE_SEPARATOR } from "@/domain/custom-value/separator";

/**
 * A custom field's value as the form submitted it. A multi-select or checkbox group posts several entries under one
 * name; they join one per line, the way a multiple-valued field is stored. A single input posts one entry, which
 * comes through unchanged.
 */
export function submittedCustomValue(entries: FormDataEntryValue[]): string {
  return entries
    .map((entry) => entry.toString())
    .filter((entry) => entry.trim() !== "")
    .join(CUSTOM_VALUE_SEPARATOR);
}

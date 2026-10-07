import { validateCustomFieldValues } from "@/domain/custom-field/coerce";
import { CustomFieldValidationError } from "@/domain/custom-field/errors";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValueRepository } from "@/domain/custom-value/repository";

export { CustomFieldValidationError };

/**
 * Validate-only pass, to be run *before* the entry is written. Persisting custom values is
 * a second write, so a value rejected there would leave a half-created entry behind that
 * the user then duplicates when they fix the value and resubmit — Redmine never gets into
 * that state, because `acts_as_customizable` validates as part of the same `save`.
 *
 * `full` picks the semantics: creation validates every applicable field, so a required one
 * the caller left out is caught, while an edit validates only the keys it was given, which
 * keeps PATCH-style partial updates from tripping over fields they didn't mention.
 */
export async function validateTimeEntryCustomFieldValues(
  customFieldRepository: CustomFieldRepository,
  rawValues: Record<string, string>,
  options: { full: boolean },
): Promise<Record<string, string>> {
  const applicableFields = await customFieldRepository.listForCustomizedType("TimeEntry");
  const values = options.full
    ? { ...Object.fromEntries(applicableFields.map((field) => [field.id, ""])), ...rawValues }
    : rawValues;
  return validateCustomFieldValues(applicableFields, values).fieldErrors;
}

/**
 * TimeEntry counterpart of setIssueCustomFieldValues. TimeEntryCustomField has no tracker
 * dimension in Redmine — every field whose customized type is TimeEntry applies to every
 * entry — so the applicable set is just `listForCustomizedType("TimeEntry")`.
 *
 * Same partial-update semantics as the issue version: only the keys present in `rawValues`
 * are touched, so a caller editing one field isn't forced to resend the rest.
 */
export async function setTimeEntryCustomFieldValues(
  repositories: { customFieldRepository: CustomFieldRepository; customValueRepository: CustomValueRepository },
  timeEntryId: string,
  rawValues: Record<string, string>,
): Promise<void> {
  const applicableFields = await repositories.customFieldRepository.listForCustomizedType("TimeEntry");
  const { fieldErrors, coerced } = validateCustomFieldValues(applicableFields, rawValues);

  if (Object.keys(fieldErrors).length > 0) {
    throw new CustomFieldValidationError(fieldErrors);
  }

  for (const { customFieldId, value } of coerced) {
    await repositories.customValueRepository.set(customFieldId, "TimeEntry", timeEntryId, value);
  }
}

import { validateCustomFieldValues } from "@/domain/custom-field/coerce";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValueRepository } from "@/domain/custom-value/repository";

export class CustomFieldValidationError extends Error {
  constructor(public readonly fieldErrors: Record<string, string>) {
    super("One or more custom field values are invalid");
    this.name = "CustomFieldValidationError";
  }
}

/**
 * Validates and persists `rawValues` (customFieldId -> raw string input) against the
 * custom fields applicable to `trackerId`. Only the keys actually present in `rawValues`
 * are touched — this is partial-update semantics, matching PATCH: a caller updating one
 * custom field must not be forced to resend every other already-set field, and must not
 * have unrelated required fields rejected as "missing" just because this call didn't
 * mention them. Callers that want full-set (create-time) semantics should pass every
 * applicable field's id as a key, using "" for anything left blank.
 */
export async function setIssueCustomFieldValues(
  repositories: { customFieldRepository: CustomFieldRepository; customValueRepository: CustomValueRepository },
  trackerId: string,
  issueId: string,
  rawValues: Record<string, string>,
): Promise<void> {
  const applicableFields = await repositories.customFieldRepository.listForTracker(trackerId);
  const { fieldErrors, coerced } = validateCustomFieldValues(applicableFields, rawValues);

  if (Object.keys(fieldErrors).length > 0) {
    throw new CustomFieldValidationError(fieldErrors);
  }

  for (const { customFieldId, value } of coerced) {
    await repositories.customValueRepository.set(customFieldId, "Issue", issueId, value);
  }
}

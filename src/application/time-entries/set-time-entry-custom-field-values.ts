import { validateCustomFieldValues } from "@/domain/custom-field/coerce";
import { CustomFieldValidationError } from "@/domain/custom-field/errors";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValueRepository } from "@/domain/custom-value/repository";

export { CustomFieldValidationError };

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

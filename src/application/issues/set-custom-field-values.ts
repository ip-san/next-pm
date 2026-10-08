import { validateCustomFieldValues } from "@/domain/custom-field/coerce";
import { visibleCustomFieldsFor, type CustomFieldViewer } from "@/domain/custom-field/visibility";
import { loadCustomFieldOptionSets, type CustomFieldOptionRepositories } from "@/application/custom-field/option-sets";
import { CustomFieldValidationError } from "@/domain/custom-field/errors";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValueRepository } from "@/domain/custom-value/repository";
import type { JournalDetail } from "@/domain/journal/entity";

export { CustomFieldValidationError };

export interface CustomFieldValueRepositories extends CustomFieldOptionRepositories {
  customFieldRepository: CustomFieldRepository;
  customValueRepository: CustomValueRepository;
}

/** One coerced value per submitted custom field, paired with what the issue holds today. */
export interface PreparedCustomFieldValues {
  entries: { customFieldId: string; oldValue: string | null; newValue: string | null }[];
}

/**
 * Validates `rawValues` (customFieldId -> raw string input) against the custom fields
 * applicable to `trackerId` and pairs each with the issue's current value, without writing
 * anything. Splitting validation out of the write lets a caller that also updates the issue
 * itself reject an invalid submission *before* persisting the issue — otherwise a bad custom
 * value would leave a half-applied edit behind.
 *
 * Only the keys actually present in `rawValues` are considered — partial-update semantics,
 * matching PATCH: a caller updating one custom field must not be forced to resend every other
 * already-set field, and must not have unrelated required fields rejected as "missing" just
 * because this call didn't mention them. Callers that want full-set (create-time) semantics
 * should pass every applicable field's id as a key, using "" for anything left blank.
 */
export async function prepareIssueCustomFieldValues(
  repositories: CustomFieldValueRepositories,
  trackerId: string,
  issueId: string,
  projectId: string,
  rawValues: Record<string, string>,
  viewer: CustomFieldViewer,
): Promise<PreparedCustomFieldValues> {
  // A field the viewer can't see is neither validated nor written, even if the request names it (Redmine's
  // editable_custom_field_values): hidden values are kept as they are, whatever the form sends.
  const applicableFields = visibleCustomFieldsFor(await repositories.customFieldRepository.listForTracker(trackerId), viewer);
  // A user or version field only takes one of the project's own members or shared versions.
  const optionSets = await loadCustomFieldOptionSets(repositories, projectId, applicableFields);
  const { fieldErrors, coerced } = validateCustomFieldValues(applicableFields, rawValues, optionSets);

  if (Object.keys(fieldErrors).length > 0) {
    throw new CustomFieldValidationError(fieldErrors);
  }

  const current = await repositories.customValueRepository.listForCustomized("Issue", issueId);
  const currentByFieldId = new Map(current.map((value) => [value.customFieldId, value.value]));

  return {
    entries: coerced.map(({ customFieldId, value }) => ({
      customFieldId,
      oldValue: currentByFieldId.get(customFieldId) ?? null,
      newValue: value,
    })),
  };
}

/**
 * Persists a prepared set and returns one journal detail per value that actually changed.
 * `fieldName` carries the custom field's id, mirroring Redmine's `JournalDetail#prop_key`
 * for `property = 'cf'` rows (the name is resolved at render time, so renaming a field
 * doesn't rewrite history).
 */
export async function applyIssueCustomFieldValues(
  repositories: Pick<CustomFieldValueRepositories, "customValueRepository">,
  issueId: string,
  prepared: PreparedCustomFieldValues,
): Promise<JournalDetail[]> {
  const details: JournalDetail[] = [];
  for (const { customFieldId, oldValue, newValue } of prepared.entries) {
    if (oldValue === newValue) continue;
    await repositories.customValueRepository.set(customFieldId, "Issue", issueId, newValue);
    details.push({ property: "cf", fieldName: customFieldId, oldValue, newValue });
  }
  return details;
}

/** Validate-then-write in one step, for callers with no issue update to sequence against. */
export async function setIssueCustomFieldValues(
  repositories: CustomFieldValueRepositories,
  trackerId: string,
  issueId: string,
  projectId: string,
  rawValues: Record<string, string>,
  viewer: CustomFieldViewer,
): Promise<JournalDetail[]> {
  const prepared = await prepareIssueCustomFieldValues(repositories, trackerId, issueId, projectId, rawValues, viewer);
  return applyIssueCustomFieldValues(repositories, issueId, prepared);
}

import { validateCustomFieldValues } from "@/domain/custom-field/coerce";
import { visibleCustomFieldsFor, type CustomFieldViewer } from "@/domain/custom-field/visibility";
import { CustomFieldValidationError } from "@/domain/custom-field/errors";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValueRepository } from "@/domain/custom-value/repository";

export { CustomFieldValidationError };

/**
 * Validates the submitted values without writing anything, so a rejected value can't leave a version saved
 * without its values (the same reason issue create validates before it writes).
 */
export async function validateVersionCustomFieldValues(
  customFieldRepository: CustomFieldRepository,
  rawValues: Record<string, string>,
  viewer: CustomFieldViewer,
): Promise<void> {
  const applicableFields = visibleCustomFieldsFor(await customFieldRepository.listForCustomizedType("Version"), viewer);
  const { fieldErrors } = validateCustomFieldValues(applicableFields, rawValues);
  if (Object.keys(fieldErrors).length > 0) {
    throw new CustomFieldValidationError(fieldErrors);
  }
}

/**
 * Version counterpart to setProjectCustomFieldValues: every field whose customized type is Version applies to
 * every version. Same partial-update semantics, and a field the editor can't see is neither validated nor written.
 */
export async function setVersionCustomFieldValues(
  repositories: { customFieldRepository: CustomFieldRepository; customValueRepository: CustomValueRepository },
  versionId: string,
  rawValues: Record<string, string>,
  viewer: CustomFieldViewer,
): Promise<void> {
  const applicableFields = visibleCustomFieldsFor(await repositories.customFieldRepository.listForCustomizedType("Version"), viewer);
  const { fieldErrors, coerced } = validateCustomFieldValues(applicableFields, rawValues);

  if (Object.keys(fieldErrors).length > 0) {
    throw new CustomFieldValidationError(fieldErrors);
  }

  for (const { customFieldId, value } of coerced) {
    await repositories.customValueRepository.set(customFieldId, "Version", versionId, value);
  }
}

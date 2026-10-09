import { validateCustomFieldValues } from "@/domain/custom-field/coerce";
import { CustomFieldValidationError } from "@/domain/custom-field/errors";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValueRepository } from "@/domain/custom-value/repository";

export { CustomFieldValidationError };

/**
 * Group counterpart to setVersionCustomFieldValues. A group's fields have no role selector (Redmine offers
 * none for groups), so every Group field applies to every group, and the writer is an admin.
 */
export async function validateGroupCustomFieldValues(
  customFieldRepository: CustomFieldRepository,
  rawValues: Record<string, string>,
): Promise<void> {
  const { fieldErrors } = validateCustomFieldValues(await customFieldRepository.listForCustomizedType("Group"), rawValues);
  if (Object.keys(fieldErrors).length > 0) {
    throw new CustomFieldValidationError(fieldErrors);
  }
}

export async function setGroupCustomFieldValues(
  repositories: { customFieldRepository: CustomFieldRepository; customValueRepository: CustomValueRepository },
  groupId: string,
  rawValues: Record<string, string>,
): Promise<void> {
  const { fieldErrors, coerced } = validateCustomFieldValues(await repositories.customFieldRepository.listForCustomizedType("Group"), rawValues);
  if (Object.keys(fieldErrors).length > 0) {
    throw new CustomFieldValidationError(fieldErrors);
  }
  for (const { customFieldId, value } of coerced) {
    await repositories.customValueRepository.set(customFieldId, "Group", groupId, value);
  }
}

import { validateCustomFieldValues } from "@/domain/custom-field/coerce";
import { visibleCustomFieldsFor, type CustomFieldViewer } from "@/domain/custom-field/visibility";
import { CustomFieldValidationError } from "@/domain/custom-field/errors";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValueRepository } from "@/domain/custom-value/repository";

export { CustomFieldValidationError };

/**
 * Project counterpart to setIssueCustomFieldValues. Project custom fields have no tracker
 * concept — every field with customizedType "Project" applies to every project — so
 * applicability is looked up by customizedType instead of by tracker. Same partial-update
 * semantics: only the keys present in `rawValues` are touched.
 */
export async function setProjectCustomFieldValues(
  repositories: { customFieldRepository: CustomFieldRepository; customValueRepository: CustomValueRepository },
  projectId: string,
  rawValues: Record<string, string>,
  viewer: CustomFieldViewer,
): Promise<void> {
  // A field the editor can't see is neither validated nor written, as on issues.
  const applicableFields = visibleCustomFieldsFor(await repositories.customFieldRepository.listForCustomizedType("Project"), viewer);
  const { fieldErrors, coerced } = validateCustomFieldValues(applicableFields, rawValues);

  if (Object.keys(fieldErrors).length > 0) {
    throw new CustomFieldValidationError(fieldErrors);
  }

  for (const { customFieldId, value } of coerced) {
    await repositories.customValueRepository.set(customFieldId, "Project", projectId, value);
  }
}

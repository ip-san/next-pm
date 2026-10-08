import type { CustomValueRepository } from "@/domain/custom-value/repository";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";

/**
 * Deletes one entry and the custom values attached to it. Redmine gets the second half for
 * free through `acts_as_customizable`'s `has_many :custom_values, :dependent => :delete_all`;
 * next-pm's `custom_values` is polymorphic with no owning foreign key, so it has to be
 * explicit. Authorization (`editable_by?`) is the caller's job — see
 * domain/time-entry/visibility.ts.
 */
export async function deleteTimeEntry(
  repositories: { timeEntryRepository: TimeEntryRepository; customValueRepository: CustomValueRepository },
  entryId: string,
): Promise<void> {
  await repositories.customValueRepository.deleteForCustomized("TimeEntry", entryId);
  await repositories.timeEntryRepository.delete(entryId);
}

import type { EnumerationAdminRepository } from "@/domain/enumeration/repository";

/** The enumeration is in use and the admin has not said what its objects should become. */
export class EnumerationReassignmentRequiredError extends Error {}
export class EnumerationNotDeletableError extends Error {}

/**
 * Mirrors EnumerationsController#destroy: an unused enumeration is deleted outright, one still
 * in use needs a `reassign_to` of the same kind, and Enumeration#destroy(reassign_to) transfers
 * its objects there before deleting it.
 *
 * Redmine offers only system-level rows (`project_id IS NULL`) as reassignment targets, so a
 * project override can never become the new home of another row's objects.
 */
export async function deleteEnumeration(
  repositories: { enumerationAdminRepository: EnumerationAdminRepository },
  enumerationId: string,
  reassignToId: string | null,
): Promise<void> {
  const { enumerationAdminRepository } = repositories;

  const enumeration = await enumerationAdminRepository.findById(enumerationId);
  if (!enumeration) {
    throw new EnumerationNotDeletableError("項目が見つかりません。");
  }

  const objectsCount = await enumerationAdminRepository.countObjectsUsing(enumeration);
  if (objectsCount === 0) {
    await enumerationAdminRepository.delete(enumerationId);
    return;
  }

  if (!reassignToId) {
    throw new EnumerationReassignmentRequiredError("使用中の項目です。付け替え先を選択してください。");
  }

  const reassignTo = await enumerationAdminRepository.findById(reassignToId);
  if (
    !reassignTo ||
    reassignTo.id === enumeration.id ||
    reassignTo.type !== enumeration.type ||
    reassignTo.projectId !== null
  ) {
    throw new EnumerationNotDeletableError("付け替え先の項目が不正です。");
  }

  await enumerationAdminRepository.transferRelations(enumeration, reassignTo.id);
  await enumerationAdminRepository.delete(enumerationId);
}

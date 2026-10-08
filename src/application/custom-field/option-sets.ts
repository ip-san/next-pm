import type { CustomField } from "@/domain/custom-field/entity";
import type { CustomFieldOptionSets } from "@/domain/custom-field/coerce";
import { memberUserIds } from "@/domain/member/entity";
import type { MemberRepository } from "@/domain/member/repository";
import { isActiveUser } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";
import type { VersionRepository } from "@/domain/version/repository";

export interface CustomFieldOptionRepositories {
  memberRepository: MemberRepository;
  userRepository: UserRepository;
  versionRepository: VersionRepository;
}

/**
 * The ids each `user` / `version` field may take in one project (Redmine's possible_values_options
 * for an issue): the project's active members for a user field, and the versions shared with the
 * project for a version field. Fields of other formats are left out of the result.
 */
export async function loadCustomFieldOptionSets(
  repositories: CustomFieldOptionRepositories,
  projectId: string,
  fields: Pick<CustomField, "id" | "fieldFormat">[],
): Promise<CustomFieldOptionSets> {
  const sets: CustomFieldOptionSets = {};
  const userFields = fields.filter((field) => field.fieldFormat === "user");
  const versionFields = fields.filter((field) => field.fieldFormat === "version");

  if (userFields.length > 0) {
    const members = await repositories.memberRepository.listByProject(projectId);
    const users = await repositories.userRepository.findByIds(memberUserIds(members));
    const activeIds = new Set(users.filter((user) => isActiveUser(user)).map((user) => user.id));
    for (const field of userFields) {
      sets[field.id] = activeIds;
    }
  }

  if (versionFields.length > 0) {
    const versionIds = new Set((await repositories.versionRepository.listSharedWith(projectId)).map((version) => version.id));
    for (const field of versionFields) {
      sets[field.id] = versionIds;
    }
  }

  return sets;
}

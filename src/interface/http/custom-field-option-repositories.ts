import type { CustomFieldOptionRepositories } from "@/application/custom-field/option-sets";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";

/** The repositories a user or version custom field's choices come from, for the request-side callers. */
export function customFieldOptionRepositories(): CustomFieldOptionRepositories {
  return {
    memberRepository: new DrizzleMemberRepository(),
    userRepository: new DrizzleUserRepository(),
    versionRepository: new DrizzleVersionRepository(),
  };
}

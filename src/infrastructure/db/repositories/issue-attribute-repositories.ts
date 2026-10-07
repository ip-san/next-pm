import type { IssueAttributeRepositories } from "@/application/issues/validate-issue-attributes";
import { DrizzleEnumerationRepository } from "./enumeration-repository";
import { DrizzleIssueCategoryRepository } from "./issue-category-repository";
import { DrizzleMemberRepository } from "./member-repository";
import { DrizzleProjectRepository } from "./project-repository";
import { DrizzleRoleRepository } from "./role-repository";
import { DrizzleTrackerRepository } from "./tracker-repository";
import { DrizzleUserRepository } from "./user-repository";
import { DrizzleVersionRepository } from "./version-repository";

/**
 * The seven repositories `assertIssueAttributesAssignable` needs, bundled so every caller of
 * `createIssue`/`updateIssue` spreads one expression instead of restating the set (and so
 * adding a future check means touching one file, not eight).
 */
export function drizzleIssueAttributeRepositories(): IssueAttributeRepositories {
  return {
    projectRepository: new DrizzleProjectRepository(),
    memberRepository: new DrizzleMemberRepository(),
    roleRepository: new DrizzleRoleRepository(),
    userRepository: new DrizzleUserRepository(),
    enumerationRepository: new DrizzleEnumerationRepository(),
    issueCategoryRepository: new DrizzleIssueCategoryRepository(),
    versionRepository: new DrizzleVersionRepository(),
    trackerRepository: new DrizzleTrackerRepository(),
  };
}

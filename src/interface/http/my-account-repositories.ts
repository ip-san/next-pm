import { DrizzleEmailAddressRepository } from "@/infrastructure/db/repositories/email-address-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzlePasswordResetTokenRepository } from "@/infrastructure/db/repositories/password-reset-token-repository";
import { DrizzleUserPreferencesRepository } from "@/infrastructure/db/repositories/user-preferences-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";

/** What updateMyAccount needs; shared by the account screen and the REST account resource. */
export function accountRepositories() {
  return {
    userRepository: new DrizzleUserRepository(),
    emailAddressRepository: new DrizzleEmailAddressRepository(),
    passwordResetTokenRepository: new DrizzlePasswordResetTokenRepository(),
    jobRepository: new DrizzleJobRepository(),
    userPreferencesRepository: new DrizzleUserPreferencesRepository(),
  };
}

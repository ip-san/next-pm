import { changeDefaultEmailAddress, type EmailAddressRepositories } from "./email-addresses";
import type { MailNotificationOption } from "@/domain/notification/mail-notification";
import type { CommentsSorting } from "@/domain/user-preferences/entity";
import type { UserPreferencesRepository } from "@/domain/user-preferences/repository";

export interface UpdateMyAccountInput {
  firstname: string;
  lastname: string;
  mail: string;
  language: string | null;
  mailNotification: MailNotificationOption;
  hideMail: boolean;
  timeZone: string | null;
  commentsSorting: CommentsSorting;
  noSelfNotified: boolean;
}

export type UpdateMyAccountRepositories = EmailAddressRepositories & {
  userPreferencesRepository: UserPreferencesRepository;
};

/**
 * Mirrors Redmine's MyController#account, which saves the User and its UserPreference in one
 * request (`@user.safe_attributes = params[:user]` / `@user.pref.safe_attributes =
 * params[:pref]`). The split across two tables is Redmine's as well.
 *
 * The address is routed through changeDefaultEmailAddress rather than written here, so a mail
 * change made from this form gets the same uniqueness check, the same recovery-token purge
 * and the same security notification to the previous address as one made from the addresses
 * section. Redmine gets that for free from the model callback; here it has to be one call.
 */
export async function updateMyAccount(
  repositories: UpdateMyAccountRepositories,
  userId: string,
  input: UpdateMyAccountInput,
): Promise<void> {
  await changeDefaultEmailAddress(repositories, userId, input.mail);

  await repositories.userRepository.updateProfile(userId, {
    firstname: input.firstname,
    lastname: input.lastname,
    language: input.language,
    mailNotification: input.mailNotification,
  });

  await repositories.userPreferencesRepository.upsertAccountPreferences(userId, {
    hideMail: input.hideMail,
    timeZone: input.timeZone,
    commentsSorting: input.commentsSorting,
    noSelfNotified: input.noSelfNotified,
  });
}

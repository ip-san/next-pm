import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { isValidEmailAddress, normalizeEmailAddress } from "@/domain/email-address/entity";
import type { EmailAddressRepository } from "@/domain/email-address/repository";
import type { JobRepository } from "@/domain/job/repository";
import type { PasswordResetTokenRepository } from "@/domain/password-reset/repository";
import type { UserRepository } from "@/domain/user/repository";

export class EmailAddressError extends Error {}

export interface EmailAddressRepositories {
  userRepository: UserRepository;
  emailAddressRepository: EmailAddressRepository;
  passwordResetTokenRepository: PasswordResetTokenRepository;
  jobRepository: JobRepository;
}

/**
 * Redmine 6 has no confirmation-token flow for email addresses — this was checked against the
 * source rather than assumed: there is no `email_verification` setting, and EmailAddress has
 * no token association. What it does instead is Mailer.deliver_security_notification from
 * EmailAddress's after_*_commit hooks, telling the affected address that something changed,
 * plus `destroy_tokens`, which drops outstanding password-recovery tokens whenever an address
 * changes or is removed (on the assumption that the mailbox itself may be compromised).
 *
 * Both halves are reproduced here. Delivering to a literal address rather than a user id is
 * the point of the `recipientAddresses` path on enqueueNotification: a notice about an address
 * being removed has to reach the address that was removed, which no longer resolves from the
 * user.
 */
async function notifySecurityChange(
  repositories: Pick<EmailAddressRepositories, "jobRepository">,
  addresses: string[],
  body: string,
): Promise<void> {
  await enqueueNotification(repositories, {
    recipientGroups: [],
    recipientAddresses: addresses,
    excludeUserId: null,
    subject: "アカウントのセキュリティ通知",
    body,
  });
}

/** Mirrors EmailAddressesController#create, including its Setting.max_additional_emails cap. */
export async function addEmailAddress(
  repositories: EmailAddressRepositories,
  userId: string,
  rawAddress: string,
  maxAdditionalEmails: number,
): Promise<void> {
  const address = normalizeEmailAddress(rawAddress);
  if (!isValidEmailAddress(address)) {
    throw new EmailAddressError("正しいメールアドレスを入力してください。");
  }

  const user = await repositories.userRepository.findById(userId);
  if (!user) {
    throw new EmailAddressError("ユーザーが見つかりません。");
  }

  const existing = await repositories.emailAddressRepository.listForUser(userId);
  if (existing.length >= maxAdditionalEmails) {
    throw new EmailAddressError(`追加できるメールアドレスは${maxAdditionalEmails}件までです。`);
  }

  // Uniqueness spans users.mail and email_addresses.address, so the database cannot enforce
  // it; findByMail searches both (case-insensitively, as Redmine's validation does) and this
  // is the only check standing between a visitor and someone else's address.
  if (await repositories.userRepository.findByMail(address)) {
    throw new EmailAddressError("そのメールアドレスは既に使用されています。");
  }

  await repositories.emailAddressRepository.create(userId, address);
  await notifySecurityChange(
    repositories,
    [user.mail],
    `アカウント(${user.login})にメールアドレス ${address} が追加されました。心当たりがない場合は管理者に連絡してください。`,
  );
}

/** Mirrors EmailAddressesController#destroy — the default address has no row here, so it cannot be removed. */
export async function removeEmailAddress(
  repositories: EmailAddressRepositories,
  userId: string,
  addressId: string,
): Promise<void> {
  const address = await repositories.emailAddressRepository.findById(addressId);
  if (!address || address.userId !== userId) {
    throw new EmailAddressError("メールアドレスが見つかりません。");
  }

  await repositories.emailAddressRepository.delete(addressId);
  // EmailAddress#destroy_tokens: an address leaving the account invalidates any outstanding
  // recovery link, which might have been mailed to that very address.
  await repositories.passwordResetTokenRepository.deleteForUser(userId);
  await notifySecurityChange(
    repositories,
    [address.address],
    `このメールアドレス(${address.address})はアカウントから削除されました。心当たりがない場合は管理者に連絡してください。`,
  );
}

/** Mirrors EmailAddressesController#update, whose only editable field is the notify flag. */
export async function setEmailAddressNotify(
  repositories: EmailAddressRepositories,
  userId: string,
  addressId: string,
  notify: boolean,
): Promise<void> {
  const address = await repositories.emailAddressRepository.findById(addressId);
  if (!address || address.userId !== userId) {
    throw new EmailAddressError("メールアドレスが見つかりません。");
  }

  await repositories.emailAddressRepository.setNotify(addressId, notify);
  await notifySecurityChange(
    repositories,
    [address.address],
    notify
      ? `このメールアドレス(${address.address})宛の通知が有効になりました。`
      : `このメールアドレス(${address.address})宛の通知が無効になりました。`,
  );
}

/**
 * Changing the *default* address. Redmine's equivalent is assigning User#mail, which updates
 * the default EmailAddress row and fires the same security notification — addressed to the
 * address being replaced (`address_before_last_save`), because that is the mailbox whose owner
 * needs to know they are losing the account.
 */
export async function changeDefaultEmailAddress(
  repositories: EmailAddressRepositories,
  userId: string,
  rawAddress: string,
): Promise<void> {
  const address = normalizeEmailAddress(rawAddress);
  if (!isValidEmailAddress(address)) {
    throw new EmailAddressError("正しいメールアドレスを入力してください。");
  }

  const user = await repositories.userRepository.findById(userId);
  if (!user) {
    throw new EmailAddressError("ユーザーが見つかりません。");
  }
  if (user.mail.toLowerCase() === address.toLowerCase()) {
    return;
  }

  // Not `owner.id !== userId`: matching one of *your own* additional addresses has to be
  // refused too, or the same address ends up in both users.mail and email_addresses, which
  // Redmine's uniqueness validation (one table, case-insensitive) would never allow. Remove
  // the additional one first.
  if (await repositories.userRepository.findByMail(address)) {
    throw new EmailAddressError("そのメールアドレスは既に使用されています。");
  }

  await repositories.userRepository.updateMail(userId, address);
  await repositories.passwordResetTokenRepository.deleteForUser(userId);
  await notifySecurityChange(
    repositories,
    [user.mail],
    `アカウント(${user.login})のメールアドレスが ${address} に変更されました。心当たりがない場合は管理者に連絡してください。`,
  );
}

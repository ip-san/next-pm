import { createHash } from "node:crypto";
import { isActiveUser } from "@/domain/user/entity";
import { generateToken } from "@/domain/user/token";
import type { UserRepository } from "@/domain/user/repository";
import type { PasswordResetTokenRepository } from "@/domain/password-reset/repository";
import type { EmailAddressRepository } from "@/domain/email-address/repository";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import type { JobRepository } from "@/domain/job/repository";

export class LdapPasswordResetNotAllowedError extends Error {}

/** Mirrors Redmine's Token::LOST_PASSWORD_VALIDITY (1 day). */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mirrors Redmine's AccountController#lost_password. `appOrigin` is embedded in the mailed
 * link — resolved by the caller from the incoming request, since a background job has no
 * request context of its own by the time it actually sends the mail.
 *
 * Always returns normally (no error, no signal) for "no such email" and "matched a local
 * account, link sent" alike — same idiom as the private-issue notFound() collapse elsewhere
 * in this app: the caller must render one uniform success message regardless of which
 * happened, so a caller-visible difference here would defeat the point. The one deliberate
 * exception is a matched LDAP account, which throws — Redmine itself breaks its own
 * uniformity for this case, telling the user outright that a reset isn't possible locally.
 */
export async function requestPasswordReset(
  repositories: {
    userRepository: UserRepository;
    passwordResetTokenRepository: PasswordResetTokenRepository;
    emailAddressRepository: EmailAddressRepository;
    jobRepository: JobRepository;
  },
  mail: string,
  appOrigin: string,
): Promise<void> {
  const user = await repositories.userRepository.findByMail(mail);
  if (!user || !isActiveUser(user)) {
    return;
  }
  if (user.authSource === "ldap") {
    throw new LdapPasswordResetNotAllowedError("LDAP認証のアカウントはパスワードをリセットできません。管理者にお問い合わせください。");
  }

  // At most one outstanding reset link per user — an older, still-mailed link must stop
  // working once a newer one is requested.
  await repositories.passwordResetTokenRepository.deleteForUser(user.id);

  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await repositories.passwordResetTokenRepository.create(user.id, hashResetToken(token), expiresAt);

  const resetUrl = `${appOrigin}/account/lost_password?token=${token}`;
  // Redmine sends this to the address that matched, not to the account's default one
  // (`user.mails.detect {|e| email.casecmp(e) == 0} || user.mail`), so someone who asked from
  // an additional address gets the link where they are reading. Addressed literally for the
  // second reason too: a transactional mail must not be suppressed by the recipient's
  // mail_notification preference — being unable to reset a password is not a notification
  // setting anyone intends to choose.
  const matchedAddress = (await repositories.emailAddressRepository.listForUser(user.id)).find(
    (address) => address.address.toLowerCase() === mail.toLowerCase(),
  );
  await enqueueNotification(repositories, {
    recipientGroups: [],
    recipientAddresses: [matchedAddress?.address ?? user.mail],
    excludeUserId: null,
    subject: "パスワード再設定",
    body: `パスワードを再設定するには、以下のリンクをクリックしてください:\n\n${resetUrl}\n\nこのリンクの有効期限は24時間です。心当たりがない場合は、このメールを無視してください。`,
  });
}

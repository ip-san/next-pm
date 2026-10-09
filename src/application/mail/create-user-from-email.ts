import { createHash, randomBytes } from "node:crypto";
import { generateSalt, hashPassword } from "@/domain/user/password";
import { generateToken } from "@/domain/user/token";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";
import type { GroupRepository } from "@/domain/group/repository";
import type { PasswordResetTokenRepository } from "@/domain/password-reset/repository";
import type { JobRepository } from "@/domain/job/repository";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { localizedMail } from "@/domain/i18n/mail-text";
import { interpolate, translate } from "@/domain/i18n/messages";

/** Mirrors Redmine's Token::LOST_PASSWORD_VALIDITY (1 day), same as request-password-reset.ts. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const LOGIN_LENGTH_LIMIT = 60;
const NAME_LENGTH_LIMIT = 30;

export interface CreateUserFromEmailInput {
  mail: string;
  /** From the From header's display name, if the sender's mailer set one. */
  fullname: string | null;
  /** Raw `default_group` option — a comma-separated list of group names. */
  defaultGroupNames: string | null;
  /** False for `no_account_notice` / `no_notification`. */
  notify: boolean;
  appOrigin: string;
}

/**
 * Port of Redmine's `MailHandler#create_user_from_email` + `.new_user_from_attributes`, used by
 * `unknown_user=create`. One deliberate difference: Redmine generates a password and mails it
 * in cleartext (`Mailer.deliver_account_information`). next-pm's notifications are persisted in
 * `jobs.payload` before they are sent, so the account mail carries a one-time password-reset
 * link instead — the account itself is created with an unusable random password.
 *
 * Returns null when the account can't be created (a login collision that survives the random
 * fallback, or a unique-constraint violation on the mail address), matching Redmine's "log and
 * give up" rather than failing the whole delivery.
 */
export async function createUserFromEmail(
  repositories: {
    userRepository: UserRepository;
    groupRepository: GroupRepository;
    passwordResetTokenRepository: PasswordResetTokenRepository;
    jobRepository: JobRepository;
  },
  input: CreateUserFromEmailInput,
): Promise<User | null> {
  const login = await availableLogin(repositories.userRepository, input.mail);
  const { firstname, lastname } = splitName(input.mail, input.fullname);
  const salt = generateSalt();

  let user: User;
  try {
    user = await repositories.userRepository.create({
      login,
      mail: input.mail,
      language: null,
      mailNotification: "all",
      firstname,
      lastname,
      isAdmin: false,
      status: "active",
      // No usable password: the account is reached through the reset link mailed below.
      passwordSalt: salt,
      passwordHash: hashPassword(randomBytes(32).toString("hex"), salt),
      mustChangePassword: true,
      apiKey: null,
      atomKey: null,
      authSource: null,
      ldapAuthSourceId: null,
      twofaScheme: null,
      twofaTotpKey: null,
      twofaTotpLastUsedStep: null,
    });
  } catch {
    return null;
  }

  await addToDefaultGroups(repositories.groupRepository, user.id, input.defaultGroupNames);

  if (input.notify) {
    const token = generateToken();
    await repositories.passwordResetTokenRepository.create(
      user.id,
      createHash("sha256").update(token).digest("hex"),
      new Date(Date.now() + TOKEN_TTL_MS),
    );
    await enqueueNotification(repositories, {
      recipientGroups: [[user.id]],
      excludeUserId: null,
      ...localizedMail((locale) => ({
        subject: translate(locale, "mail.createdFromEmail.subject"),
        body:
          `${interpolate(translate(locale, "mail.createdFromEmail.intro"), { login })}\n\n` +
          `${translate(locale, "mail.createdFromEmail.action")}\n\n${input.appOrigin}/account/lost_password?token=${token}\n\n` +
          translate(locale, "mail.linkExpires"),
      })),
    });
  }

  return user;
}

/** Redmine falls back to `user<random hex>` when the address can't serve as a login. */
async function availableLogin(userRepository: UserRepository, mail: string): Promise<string> {
  const candidate = mail.slice(0, LOGIN_LENGTH_LIMIT);
  if (candidate.length > 0 && !(await userRepository.findByLogin(candidate))) {
    return candidate;
  }
  return `user${randomBytes(6).toString("hex")}`;
}

function splitName(mail: string, fullname: string | null): { firstname: string; lastname: string } {
  const parts = (fullname?.trim() ? fullname.trim().split(/\s+/) : mail.replace(/@.*$/, "").split(".")).filter(
    (part) => part.length > 0,
  );
  const firstname = (parts.shift() ?? "-").slice(0, NAME_LENGTH_LIMIT);
  const lastname = parts.join(" ").slice(0, NAME_LENGTH_LIMIT);
  return { firstname, lastname: lastname.length > 0 ? lastname : "-" };
}

async function addToDefaultGroups(
  groupRepository: GroupRepository,
  userId: string,
  defaultGroupNames: string | null,
): Promise<void> {
  const names = (defaultGroupNames ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) return;

  const groups = await groupRepository.listAll();
  for (const name of names) {
    const group = groups.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
    // A missing group is a configuration mistake, not a reason to drop the mail — Redmine warns and continues.
    if (group) {
      await groupRepository.addUser(group.id, userId);
    }
  }
}

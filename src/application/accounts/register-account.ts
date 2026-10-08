import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import type { JobRepository } from "@/domain/job/repository";
import type { AuthSettings } from "@/domain/settings/auth-settings";
import type { User } from "@/domain/user/entity";
import { describePasswordPolicyFailure } from "@/domain/user/password-policy";
import { generateSalt, hashPassword } from "@/domain/user/password";
import type { UserRepository } from "@/domain/user/repository";
import { generateToken } from "@/domain/user/token";
import { ACTIVATION_TOKEN_TTL_MS, hashUserToken } from "@/domain/user-token/entity";
import type { UserTokenRepository } from "@/domain/user-token/repository";

export class SelfRegistrationDisabledError extends Error {}
export class RegistrationInputError extends Error {}

export interface RegisterAccountRepositories {
  userRepository: UserRepository;
  userTokenRepository: UserTokenRepository;
  jobRepository: JobRepository;
}

export interface RegisterAccountInput {
  login: string;
  mail: string;
  firstname: string;
  lastname: string;
  password: string;
}

export type RegisterAccountResult =
  /** Mode '3': the account is usable straight away and the caller logs the user in. */
  | { kind: "activated"; user: User }
  /** Mode '1': an activation link was mailed; nothing happens until it is followed. */
  | { kind: "activation_email_sent"; user: User }
  /** Mode '2': administrators were notified and must activate the account themselves. */
  | { kind: "pending_admin_activation"; user: User };

/**
 * Mirrors Redmine's AccountController#register and its three register_* helpers. The mode is
 * read from the settings the caller passes in and checked *here*, not only by hiding the
 * form: Redmine's own first line is `redirect_to(home_url) unless Setting.self_registration?`,
 * and a registration endpoint that trusts the UI to have been hidden is an open signup.
 *
 * `user.admin = false` in Redmine is a safe_attributes consequence; here it is simply not an
 * input — nothing a visitor submits can reach isAdmin.
 */
export async function registerAccount(
  repositories: RegisterAccountRepositories,
  input: RegisterAccountInput,
  settings: AuthSettings,
  appOrigin: string,
): Promise<RegisterAccountResult> {
  if (settings.selfRegistration === "0") {
    throw new SelfRegistrationDisabledError("アカウントの登録は受け付けていません。");
  }

  const policyFailure = describePasswordPolicyFailure(
    input.password,
    { minLength: settings.passwordMinLength, requiredCharClasses: settings.passwordRequiredCharClasses },
    { login: input.login, firstname: input.firstname, lastname: input.lastname, mails: [input.mail] },
  );
  if (policyFailure) {
    throw new RegistrationInputError(policyFailure);
  }

  if (await repositories.userRepository.findByLogin(input.login)) {
    throw new RegistrationInputError("そのログインIDは既に使用されています。");
  }
  if (await repositories.userRepository.findByMail(input.mail)) {
    throw new RegistrationInputError("そのメールアドレスは既に使用されています。");
  }

  const salt = generateSalt();
  // Redmine's User#register leaves the account at STATUS_REGISTERED; mode '3' calls #activate
  // before saving. Either way the row is written exactly once.
  const activateImmediately = settings.selfRegistration === "3";
  const user = await repositories.userRepository.create({
    login: input.login,
    mail: input.mail,
    firstname: input.firstname,
    lastname: input.lastname,
    isAdmin: false,
    status: activateImmediately ? "active" : "registered",
    passwordSalt: salt,
    passwordHash: hashPassword(input.password, salt),
    language: null,
    mailNotification: "all",
    mustChangePassword: false,
    apiKey: null,
    atomKey: null,
    authSource: null,
    twofaScheme: null,
    twofaTotpKey: null,
    twofaTotpLastUsedStep: null,
  });

  if (activateImmediately) {
    return { kind: "activated", user };
  }

  if (settings.selfRegistration === "1") {
    await sendActivationEmail(repositories, user, appOrigin);
    return { kind: "activation_email_sent", user };
  }

  // Mode '2' — Redmine's Mailer.deliver_account_activation_request, sent to every active admin.
  const admins = (await repositories.userRepository.listAll()).filter((u) => u.isAdmin && u.status === "active");
  await enqueueNotification(repositories, {
    recipientGroups: [],
    // Also literal: an administrator who set mail_notification = none still has to hear about
    // an account waiting on them, or mode '2' quietly stalls. Redmine treats
    // deliver_account_activation_request the same way.
    recipientAddresses: admins.map((admin) => admin.mail),
    excludeUserId: null,
    subject: "アカウントの有効化依頼",
    body:
      `新しいアカウントの登録申請がありました。\n\n` +
      `ログインID: ${user.login}\n氏名: ${user.lastname} ${user.firstname}\nメール: ${user.mail}\n\n` +
      `有効化するには以下のページを開いてください:\n${appOrigin}/admin/users`,
  });
  return { kind: "pending_admin_activation", user };
}

/**
 * Mirrors Mailer.deliver_register. Also used by the "resend the activation email" path, which
 * Redmine exposes as AccountController#activation_email.
 */
export async function sendActivationEmail(
  repositories: Pick<RegisterAccountRepositories, "userTokenRepository" | "jobRepository">,
  user: User,
  appOrigin: string,
): Promise<void> {
  // One outstanding activation link per account, same rule as the password-reset link.
  await repositories.userTokenRepository.deleteForUser(user.id, "register");

  const token = generateToken();
  await repositories.userTokenRepository.create(
    user.id,
    "register",
    hashUserToken(token),
    new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS),
  );

  // Addressed literally, not by user id. This mail exists precisely because the account is
  // still `registered`, and dispatchJob only resolves *active* users — routing it through
  // recipientGroups would mean the activation mail for a pending account is never sent, which
  // would make mode '1' impossible to complete. Redmine's Mailer.deliver_register is a
  // transactional mail for the same reason: it ignores status and notification preferences.
  await enqueueNotification(repositories, {
    recipientGroups: [],
    recipientAddresses: [user.mail],
    excludeUserId: null,
    subject: "アカウントの有効化",
    body: `アカウントを有効にするには、以下のリンクをクリックしてください:\n\n${appOrigin}/account/activate?token=${token}\n\nこのリンクの有効期限は24時間です。`,
  });
}

export type ActivateAccountResult = { ok: true; user: User } | { ok: false };

/**
 * Mirrors AccountController#activate. Three conditions, all of which Redmine checks and all of
 * which collapse to the same silent redirect so the endpoint reveals nothing: the setting must
 * still allow registration, the token must exist and be unexpired, and the account must still
 * be `registered` — an already-active (or locked) account must not be re-activated by replaying
 * an old link.
 */
export async function activateAccount(
  repositories: { userRepository: UserRepository; userTokenRepository: UserTokenRepository },
  token: string,
  settings: AuthSettings,
  now: Date = new Date(),
): Promise<ActivateAccountResult> {
  if (settings.selfRegistration === "0") {
    return { ok: false };
  }

  const stored = await repositories.userTokenRepository.findByTokenHash("register", hashUserToken(token));
  if (!stored) {
    return { ok: false };
  }
  if (stored.expiresAt.getTime() <= now.getTime()) {
    await repositories.userTokenRepository.delete(stored.id);
    return { ok: false };
  }

  const user = await repositories.userRepository.findById(stored.userId);
  if (!user || user.status !== "registered") {
    await repositories.userTokenRepository.delete(stored.id);
    return { ok: false };
  }

  await repositories.userRepository.updateStatus(user.id, "active");
  await repositories.userTokenRepository.delete(stored.id);
  return { ok: true, user: { ...user, status: "active" } };
}

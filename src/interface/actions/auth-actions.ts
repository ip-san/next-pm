"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadLdapConfigFromEnv } from "@/domain/ldap/config";
import { evaluateLoginGate, INACTIVE_ACCOUNT_MESSAGE } from "@/domain/user/login-gate";
import { changePassword, CurrentPasswordMismatchError, InvalidPasswordError, LdapPasswordChangeNotAllowedError } from "@/application/auth/change-password";
import { login } from "@/application/auth/login";
import { LdapPasswordResetNotAllowedError, requestPasswordReset } from "@/application/auth/request-password-reset";
import { InvalidResetTokenError, resetPassword } from "@/application/auth/reset-password";
import { verifyTwofaCode } from "@/application/twofa/verify";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { loadTotpEncryptionKeyFromEnv } from "@/domain/twofa/encryption-key";
import { DrizzlePasswordResetTokenRepository } from "@/infrastructure/db/repositories/password-reset-token-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleTwofaBackupCodeRepository } from "@/infrastructure/db/repositories/twofa-backup-code-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { createTwofaPendingToken, TWOFA_MAX_ATTEMPTS, verifyTwofaPendingToken } from "@/infrastructure/auth/twofa-pending-token";
import { LdaptsAuthenticator } from "@/infrastructure/ldap/ldapts-authenticator";
import { resolveAppOrigin } from "@/interface/http/app-origin";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { destroyCurrentSession, establishSession, revokeAllSessions } from "@/interface/http/session";
import { TWOFA_PENDING_COOKIE_MAX_AGE_SECONDS, TWOFA_PENDING_COOKIE_NAME } from "@/interface/http/twofa-pending-cookie";

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean(),
});

export type LoginActionState = {
  error: string | null;
};

async function setPendingTwofaCookie(userId: string, rememberMe: boolean, attempts = 0): Promise<void> {
  // The remember-me choice has to survive the second-factor round trip, exactly as Redmine
  // stashes session[:twofa_autologin] — otherwise ticking the box silently does nothing for
  // every user who has 2FA on.
  const pendingToken = await createTwofaPendingToken({ userId, attempts, rememberMe });
  const cookieStore = await cookies();
  cookieStore.set(TWOFA_PENDING_COOKIE_NAME, pendingToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TWOFA_PENDING_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    login: formData.get("login"),
    password: formData.get("password"),
    rememberMe: formData.get("rememberMe") === "on",
  });
  if (!parsed.success) {
    return { error: "ログインIDとパスワードを入力してください。" };
  }

  const { twofa } = await loadAuthSettings(new DrizzleSettingsRepository());
  const ldapConfig = loadLdapConfigFromEnv(process.env);
  const result = await login(
    { userRepository: new DrizzleUserRepository(), ldapAuthenticator: ldapConfig ? new LdaptsAuthenticator(ldapConfig) : null },
    parsed.data.login,
    parsed.data.password,
    twofa,
  );
  if (!result.ok) {
    return { error: "ログインIDまたはパスワードが正しくありません。" };
  }

  switch (result.outcome.kind) {
    case "inactive":
      return { error: INACTIVE_ACCOUNT_MESSAGE[result.outcome.status] ?? "このアカウントではログインできません。" };
    case "twofa_required":
      await setPendingTwofaCookie(result.user.id, parsed.data.rememberMe);
      redirect("/login/twofa");
      break;
    case "twofa_setup_required":
      await setPendingTwofaCookie(result.user.id, parsed.data.rememberMe);
      redirect("/login/twofa/setup");
      break;
    case "allowed":
      await establishSession(result.user.id, { rememberMe: parsed.data.rememberMe });
      redirect("/");
  }
  return { error: null };
}

export type VerifyTwofaActionState = {
  error: string | null;
};

const twofaCodeSchema = z.object({
  code: z.string().min(1),
});

/**
 * Second-factor gate: reads the pending token minted by loginAction (never a real session —
 * see session-token.ts's purpose-claim isolation), verifies the submitted code against either
 * a live TOTP code or a one-time backup code, and only then issues the real session cookie.
 * Mirrors Redmine's account#twofa action, including its "at most 3 tries per successful
 * password entry" limit (account_controller.rb) — exceeding it forces back to the password
 * form rather than allowing indefinite guessing against the same pending login.
 */
export async function verifyTwofaAction(
  _prevState: VerifyTwofaActionState,
  formData: FormData,
): Promise<VerifyTwofaActionState> {
  const parsed = twofaCodeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return { error: "確認コードを入力してください。" };
  }

  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(TWOFA_PENDING_COOKIE_NAME)?.value;
  const pending = pendingToken ? await verifyTwofaPendingToken(pendingToken) : null;
  if (!pending) {
    cookieStore.delete(TWOFA_PENDING_COOKIE_NAME);
    redirect("/login");
  }

  const encryptionKey = loadTotpEncryptionKeyFromEnv(process.env);
  const result = await verifyTwofaCode(
    { userRepository: new DrizzleUserRepository(), backupCodeRepository: new DrizzleTwofaBackupCodeRepository() },
    pending.userId,
    parsed.data.code,
    encryptionKey,
    Math.floor(Date.now() / 1000),
  );

  if (result.verified) {
    // The gate runs again rather than being assumed from the password step: minutes may have
    // passed, and the account could have been locked in between (Redmine re-reads the user in
    // handle_active_user for the same reason). skipTwofa, because this *is* the second factor.
    const user = await new DrizzleUserRepository().findById(pending.userId);
    const { twofa } = await loadAuthSettings(new DrizzleSettingsRepository());
    if (!user || evaluateLoginGate(user, twofa, { skipTwofa: true }).kind !== "allowed") {
      cookieStore.delete(TWOFA_PENDING_COOKIE_NAME);
      redirect("/login");
    }
    await establishSession(pending.userId, { rememberMe: pending.rememberMe });
    redirect("/");
  }

  const attempts = pending.attempts + 1;
  if (attempts >= TWOFA_MAX_ATTEMPTS) {
    cookieStore.delete(TWOFA_PENDING_COOKIE_NAME);
    redirect("/login?error=twofa_too_many_tries");
  }

  await setPendingTwofaCookie(pending.userId, pending.rememberMe, attempts);
  return { error: "確認コードが正しくありません。" };
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}

export type ChangePasswordActionState = {
  error: string | null;
  ok: boolean;
};

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function changePasswordAction(
  _prevState: ChangePasswordActionState,
  formData: FormData,
): Promise<ChangePasswordActionState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { error: "現在のパスワードと新しいパスワードを入力してください。", ok: false };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。", ok: false };
  }

  try {
    const { passwordMinLength, passwordRequiredCharClasses } = await loadAuthSettings(new DrizzleSettingsRepository());
    await changePassword(
      { userRepository: new DrizzleUserRepository() },
      {
        userId: user.id,
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        policy: { minLength: passwordMinLength, requiredCharClasses: passwordRequiredCharClasses },
      },
    );
  } catch (error) {
    if (error instanceof LdapPasswordChangeNotAllowedError || error instanceof InvalidPasswordError || error instanceof CurrentPasswordMismatchError) {
      return { error: error.message, ok: false };
    }
    throw error;
  }

  // Redmine's User#destroy_tokens: a password change kills every session and remember-me
  // cookie the account holds, on the assumption that the old password may be compromised.
  // The user doing the changing gets a fresh session right back (MyController#password's
  // `session[:tk] = @user.generate_session_token`), so only their *other* devices log out.
  await revokeAllSessions(user.id);
  await establishSession(user.id);

  revalidatePath("/my/account");
  return { error: null, ok: true };
}

export type LostPasswordActionState = {
  error: string | null;
  success: boolean;
};

const lostPasswordSchema = z.object({
  mail: z.string().email(),
});

export async function lostPasswordAction(
  _prevState: LostPasswordActionState,
  formData: FormData,
): Promise<LostPasswordActionState> {
  const parsed = lostPasswordSchema.safeParse({ mail: formData.get("mail") });
  if (!parsed.success) {
    return { error: "メールアドレスを入力してください。", success: false };
  }

  // Redmine's AccountController#lost_password bails out to the home page unless
  // Setting.lost_password? — the setting has to hold on the submit path too, not only by
  // hiding the link, or the form stays reachable by URL once an admin turns it off.
  const { lostPasswordEnabled } = await loadAuthSettings(new DrizzleSettingsRepository());
  if (!lostPasswordEnabled) {
    return { error: "パスワードの再設定は無効になっています。管理者にお問い合わせください。", success: false };
  }

  try {
    await requestPasswordReset(
      { userRepository: new DrizzleUserRepository(), passwordResetTokenRepository: new DrizzlePasswordResetTokenRepository(), jobRepository: new DrizzleJobRepository() },
      parsed.data.mail,
      await resolveAppOrigin(),
    );
  } catch (error) {
    if (error instanceof LdapPasswordResetNotAllowedError) {
      return { error: error.message, success: false };
    }
    throw error;
  }

  // Same response whether or not the address matched an account — see requestPasswordReset's
  // doc comment for why this uniformity matters.
  return { error: null, success: true };
}

export type ResetPasswordActionState = {
  error: string | null;
  success: boolean;
};

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function resetPasswordAction(
  _prevState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { error: "新しいパスワードを入力してください。", success: false };
  }

  try {
    const { passwordMinLength, passwordRequiredCharClasses } = await loadAuthSettings(new DrizzleSettingsRepository());
    const { userId } = await resetPassword(
      { userRepository: new DrizzleUserRepository(), passwordResetTokenRepository: new DrizzlePasswordResetTokenRepository() },
      parsed.data.token,
      parsed.data.newPassword,
      { minLength: passwordMinLength, requiredCharClasses: passwordRequiredCharClasses },
    );
    // Same rule as a self-service change (User#destroy_tokens), and it matters more here:
    // whoever used the reset link may be recovering the account precisely because someone
    // else had it. No new session is minted — the reset flow sends them to the login form.
    await revokeAllSessions(userId);
  } catch (error) {
    if (error instanceof InvalidResetTokenError || error instanceof InvalidPasswordError) {
      return { error: error.message, success: false };
    }
    throw error;
  }

  return { error: null, success: true };
}

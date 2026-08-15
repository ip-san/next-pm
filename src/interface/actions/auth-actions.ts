"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadLdapConfigFromEnv } from "@/domain/ldap/config";
import { changePassword, CurrentPasswordMismatchError, InvalidPasswordError, LdapPasswordChangeNotAllowedError } from "@/application/auth/change-password";
import { login } from "@/application/auth/login";
import { LdapPasswordResetNotAllowedError, requestPasswordReset } from "@/application/auth/request-password-reset";
import { InvalidResetTokenError, resetPassword } from "@/application/auth/reset-password";
import { verifyTwofaCode } from "@/application/twofa/verify";
import { loadTotpEncryptionKeyFromEnv } from "@/domain/twofa/encryption-key";
import { DrizzlePasswordResetTokenRepository } from "@/infrastructure/db/repositories/password-reset-token-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleTwofaBackupCodeRepository } from "@/infrastructure/db/repositories/twofa-backup-code-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { createSessionToken } from "@/infrastructure/auth/session-token";
import { createTwofaPendingToken, TWOFA_MAX_ATTEMPTS, verifyTwofaPendingToken } from "@/infrastructure/auth/twofa-pending-token";
import { LdaptsAuthenticator } from "@/infrastructure/ldap/ldapts-authenticator";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { TWOFA_PENDING_COOKIE_MAX_AGE_SECONDS, TWOFA_PENDING_COOKIE_NAME } from "@/interface/http/twofa-pending-cookie";

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export type LoginActionState = {
  error: string | null;
};

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "next_pm_session";

async function establishSession(userId: string): Promise<void> {
  const token = await createSessionToken({ userId });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  cookieStore.delete(TWOFA_PENDING_COOKIE_NAME);
}

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    login: formData.get("login"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "ログインIDとパスワードを入力してください。" };
  }

  const ldapConfig = loadLdapConfigFromEnv(process.env);
  const result = await login(
    { userRepository: new DrizzleUserRepository(), ldapAuthenticator: ldapConfig ? new LdaptsAuthenticator(ldapConfig) : null },
    parsed.data.login,
    parsed.data.password,
  );
  if (!result.ok) {
    return { error: "ログインIDまたはパスワードが正しくありません。" };
  }

  if (result.twofaRequired) {
    const pendingToken = await createTwofaPendingToken({ userId: result.user.id, attempts: 0 });
    const cookieStore = await cookies();
    cookieStore.set(TWOFA_PENDING_COOKIE_NAME, pendingToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TWOFA_PENDING_COOKIE_MAX_AGE_SECONDS,
    });
    redirect("/login/twofa");
  }

  await establishSession(result.user.id);
  redirect("/");
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
    await establishSession(pending.userId);
    redirect("/");
  }

  const attempts = pending.attempts + 1;
  if (attempts >= TWOFA_MAX_ATTEMPTS) {
    cookieStore.delete(TWOFA_PENDING_COOKIE_NAME);
    redirect("/login?error=twofa_too_many_tries");
  }

  const renewedToken = await createTwofaPendingToken({ userId: pending.userId, attempts });
  cookieStore.set(TWOFA_PENDING_COOKIE_NAME, renewedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TWOFA_PENDING_COOKIE_MAX_AGE_SECONDS,
  });
  return { error: "確認コードが正しくありません。" };
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(TWOFA_PENDING_COOKIE_NAME);
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
    await changePassword(
      { userRepository: new DrizzleUserRepository() },
      { userId: user.id, currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword },
    );
  } catch (error) {
    if (error instanceof LdapPasswordChangeNotAllowedError || error instanceof InvalidPasswordError || error instanceof CurrentPasswordMismatchError) {
      return { error: error.message, ok: false };
    }
    throw error;
  }

  revalidatePath("/my/account");
  return { error: null, ok: true };
}

/** Resolves the origin (scheme + host) of the incoming request, for building an absolute link
 *  to embed in a mailed notification — a background job has no request context of its own by
 *  the time it actually sends the mail, so the origin must be captured here instead. */
async function resolveAppOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
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
    await resetPassword(
      { userRepository: new DrizzleUserRepository(), passwordResetTokenRepository: new DrizzlePasswordResetTokenRepository() },
      parsed.data.token,
      parsed.data.newPassword,
    );
  } catch (error) {
    if (error instanceof InvalidResetTokenError || error instanceof InvalidPasswordError) {
      return { error: error.message, success: false };
    }
    throw error;
  }

  return { error: null, success: true };
}

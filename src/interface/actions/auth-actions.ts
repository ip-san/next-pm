"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { loadLdapConfigFromEnv } from "@/domain/ldap/config";
import { login } from "@/application/auth/login";
import { verifyTwofaCode } from "@/application/twofa/verify";
import { loadTotpEncryptionKeyFromEnv } from "@/domain/twofa/encryption-key";
import { DrizzleTwofaBackupCodeRepository } from "@/infrastructure/db/repositories/twofa-backup-code-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { createSessionToken } from "@/infrastructure/auth/session-token";
import { createTwofaPendingToken, TWOFA_MAX_ATTEMPTS, verifyTwofaPendingToken } from "@/infrastructure/auth/twofa-pending-token";
import { LdaptsAuthenticator } from "@/infrastructure/ldap/ldapts-authenticator";
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

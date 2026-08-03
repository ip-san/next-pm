"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { loadLdapConfigFromEnv } from "@/domain/ldap/config";
import { login } from "@/application/auth/login";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { createSessionToken } from "@/infrastructure/auth/session-token";
import { LdaptsAuthenticator } from "@/infrastructure/ldap/ldapts-authenticator";

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export type LoginActionState = {
  error: string | null;
};

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "next_pm_session";

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

  const token = await createSessionToken({ userId: result.user.id });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

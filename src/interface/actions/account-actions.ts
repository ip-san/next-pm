"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  registerAccount,
  RegistrationInputError,
  SelfRegistrationDisabledError,
} from "@/application/accounts/register-account";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { evaluateLoginGate } from "@/domain/user/login-gate";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleUserTokenRepository } from "@/infrastructure/db/repositories/user-token-repository";
import { resolveAppOrigin } from "@/interface/http/app-origin";
import { currentLocale } from "@/interface/http/locale";
import { startPendingTwofaSetup } from "@/interface/http/twofa-pending-cookie";
import { establishSession } from "@/interface/http/session";
import { localizeError } from "@/interface/http/localize-error";

export type RegisterActionState = {
  error: string | null;
  /** Non-null once the account exists: which of Redmine's three "what happens next" messages to show. */
  outcome: "activation_email_sent" | "pending_admin_activation" | null;
};

const registerSchema = z.object({
  login: z.string().min(1).max(30),
  mail: z.string().email("正しいメールアドレスを入力してください。"),
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  password: z.string().min(1, "パスワードを入力してください。"),
});

export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const parsed = registerSchema.safeParse({
    login: formData.get("login"),
    mail: formData.get("mail"),
    firstname: formData.get("firstname"),
    lastname: formData.get("lastname"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。"), outcome: null };
  }

  const settings = await loadAuthSettings(new DrizzleSettingsRepository());
  let result;
  try {
    result = await registerAccount(
      {
        userRepository: new DrizzleUserRepository(),
        userTokenRepository: new DrizzleUserTokenRepository(),
        jobRepository: new DrizzleJobRepository(),
      },
      { ...parsed.data, language: await currentLocale() },
      settings,
      await resolveAppOrigin(),
    );
  } catch (error) {
    if (error instanceof SelfRegistrationDisabledError || error instanceof RegistrationInputError) {
      return { error: await localizeError(error.message), outcome: null };
    }
    throw error;
  }

  if (result.kind === "activated") {
    // Redmine's register_automatically logs the user straight in and sends them to my/account.
    // It still has to clear the same gate every other login does: with twofa '2' (required for
    // everyone) a brand-new account owes a second factor before it gets a session, and handing
    // one out here would be a way in that skips the requirement entirely.
    if (evaluateLoginGate(result.user, settings.twofa).kind !== "allowed") {
      await startPendingTwofaSetup(result.user.id);
      redirect("/login/twofa/setup");
    }
    await establishSession(result.user.id);
    redirect("/my/account");
  }
  return { error: null, outcome: result.kind };
}

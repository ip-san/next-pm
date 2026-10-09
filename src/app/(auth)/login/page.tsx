import { translate } from "@/domain/i18n/messages";
import { currentLocale } from "@/interface/http/locale";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { isSelfRegistrationEnabled } from "@/domain/settings/auth-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { LoginForm } from "./login-form";

// The form's shape depends on settings read at request time.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; activated?: string }>;
}) {
  const locale = await currentLocale();
  const { error, activated } = await searchParams;
  const settings = await loadAuthSettings(new DrizzleSettingsRepository());

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 items-center">
        <h1 className="text-2xl font-semibold">{translate(locale, "auth.loginTitle")}</h1>
        {error === "twofa_too_many_tries" ? (
          <p role="alert" className="text-sm text-red-600">
            {translate(locale, "auth.twofaLocked")}
          </p>
        ) : null}
        {error === "activation_failed" ? (
          <p role="alert" className="text-sm text-red-600">
            {translate(locale, "auth.linkInvalid")}
          </p>
        ) : null}
        {activated === "1" ? <p className="text-sm text-green-700">{translate(locale, "auth.activated")}</p> : null}
        <LoginForm
          autologinEnabled={settings.autologinDays > 0}
          lostPasswordEnabled={settings.lostPasswordEnabled}
          selfRegistrationEnabled={isSelfRegistrationEnabled(settings)}
          labels={{
            loginId: translate(locale, "login.loginId"),
            password: translate(locale, "login.password"),
            rememberMe: translate(locale, "login.rememberMe"),
            submit: translate(locale, "login.submit"),
            submitting: translate(locale, "login.submitting"),
            lostPassword: translate(locale, "login.lostPassword"),
            register: translate(locale, "auth.registerLink"),
          }}
        />
      </div>
    </main>
  );
}

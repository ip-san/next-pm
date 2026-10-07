import { loadAuthSettings } from "@/application/settings/auth-settings";
import { isSelfRegistrationEnabled } from "@/domain/settings/auth-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { LoginForm } from "./login-form";

// The form's shape depends on settings read at request time.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const settings = await loadAuthSettings(new DrizzleSettingsRepository());

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 items-center">
        <h1 className="text-2xl font-semibold">next-pm にログイン</h1>
        {error === "twofa_too_many_tries" ? (
          <p role="alert" className="text-sm text-red-600">
            確認コードの試行回数が上限に達しました。もう一度ログインしてください。
          </p>
        ) : null}
        <LoginForm
          autologinEnabled={settings.autologinDays > 0}
          lostPasswordEnabled={settings.lostPasswordEnabled}
          selfRegistrationEnabled={isSelfRegistrationEnabled(settings)}
        />
      </div>
    </main>
  );
}

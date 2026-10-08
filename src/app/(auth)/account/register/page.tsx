import { notFound } from "next/navigation";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { isSelfRegistrationEnabled } from "@/domain/settings/auth-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const settings = await loadAuthSettings(new DrizzleSettingsRepository());
  // Redmine's `redirect_to(home_url) unless Setting.self_registration?`. The action checks
  // this too — hiding the page is presentation, not enforcement.
  if (!isSelfRegistrationEnabled(settings)) {
    notFound();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 items-center">
        <h1 className="text-2xl font-semibold">アカウント登録</h1>
        <RegisterForm passwordMinLength={settings.passwordMinLength} />
      </div>
    </main>
  );
}

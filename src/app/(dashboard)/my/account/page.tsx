import Link from "next/link";
import { redirect } from "next/navigation";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { listProjectsWithPermission } from "@/interface/http/resolve-actor";
import { PasswordSection } from "./password-section";
import { TwofaSection } from "./twofa-section";

export default async function MyAccountPage() {
  const user = await currentUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  // Same condition as Redmine's my/account.html.erb link: the feature is on and the user
  // holds use_webhooks somewhere.
  const { webhooksEnabled } = await loadGeneralSettings(new DrizzleSettingsRepository());
  const canUseWebhooks = webhooksEnabled && (await listProjectsWithPermission(user, "use_webhooks")).length > 0;

  return (
    <main className="p-8 flex flex-col gap-6 max-w-lg">
      <h1 className="text-xl font-semibold">アカウント設定</h1>
      {canUseWebhooks ? (
        <Link href="/my/webhooks" className="text-sm underline self-start">
          Webhook
        </Link>
      ) : null}
      <PasswordSection authSource={user.authSource} />
      <TwofaSection enabled={user.twofaScheme !== null} />
    </main>
  );
}

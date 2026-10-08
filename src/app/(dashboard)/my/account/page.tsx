import Link from "next/link";
import { redirect } from "next/navigation";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { ownAccountDeletable } from "@/domain/user/account-deletion";
import { isActiveUser } from "@/domain/user/entity";
import { UserAvatar } from "@/interface/components/user-avatar";
import { resolvePreferences } from "@/domain/user-preferences/entity";
import { isTwofaAvailable } from "@/domain/settings/auth-settings";
import { DrizzleEmailAddressRepository } from "@/infrastructure/db/repositories/email-address-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserPreferencesRepository } from "@/infrastructure/db/repositories/user-preferences-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { listProjectsWithPermission } from "@/interface/http/resolve-actor";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { AccessKeysSection } from "./access-keys-section";
import { DeleteAccountSection } from "./delete-account-section";
import { EmailAddressesSection } from "./email-addresses-section";
import { PasswordSection } from "./password-section";
import { ProfileSection } from "./profile-section";
import { TwofaSection } from "./twofa-section";

export const dynamic = "force-dynamic";

export default async function MyAccountPage() {
  const user = await currentUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const settings = await loadAuthSettings(new DrizzleSettingsRepository());
  const preferences = resolvePreferences(
    await new DrizzleUserPreferencesRepository().findByUserId(user.id),
    user.id,
  );
  const additionalAddresses = await new DrizzleEmailAddressRepository().listForUser(user.id);
  // Redmine's User#own_account_deletable? — the section is not rendered at all when it is
  // false, and deleteOwnAccountAction re-checks the same rule server-side.
  const otherActiveAdminExists = (await new DrizzleUserRepository().listAll()).some(
    (candidate) => candidate.id !== user.id && candidate.isAdmin && isActiveUser(candidate),
  );
  const canDeleteOwnAccount = ownAccountDeletable(user, settings.unsubscribeEnabled, otherActiveAdminExists);
  // Same condition as Redmine's my/account.html.erb link: the feature is on and the user
  // holds use_webhooks somewhere.
  const { webhooksEnabled } = await loadGeneralSettings(new DrizzleSettingsRepository());
  const canUseWebhooks = webhooksEnabled && (await listProjectsWithPermission(user, "use_webhooks")).length > 0;

  return (
    <main className="p-8 flex flex-col gap-6 max-w-lg">
      <div className="flex items-center gap-3">
        <UserAvatar mail={user.mail} gravatarEnabled={settings.gravatarEnabled} size={48} />
        <h1 className="text-xl font-semibold">アカウント設定</h1>
      </div>
      {canUseWebhooks ? (
        <Link href="/my/webhooks" className="text-sm underline self-start">
          Webhook
        </Link>
      ) : null}

      <ProfileSection
        values={{
          firstname: user.firstname,
          lastname: user.lastname,
          mail: user.mail,
          language: user.language,
          mailNotification: user.mailNotification,
          hideMail: preferences.hideMail,
          timeZone: preferences.timeZone,
          commentsSorting: preferences.commentsSorting,
          noSelfNotified: preferences.noSelfNotified,
        }}
      />
      <EmailAddressesSection
        defaultMail={user.mail}
        addresses={additionalAddresses.map((address) => ({ id: address.id, address: address.address, notify: address.notify }))}
        maxAdditionalEmails={settings.maxAdditionalEmails}
      />
      <PasswordSection authSource={user.authSource} />
      {isTwofaAvailable(settings) ? <TwofaSection enabled={user.twofaScheme !== null} /> : null}
      <AccessKeysSection hasApiKey={user.apiKey !== null} atomKey={user.atomKey} />
      {canDeleteOwnAccount ? <DeleteAccountSection /> : null}
    </main>
  );
}

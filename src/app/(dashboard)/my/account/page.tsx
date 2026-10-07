import { redirect } from "next/navigation";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { gravatarUrl, userInitials } from "@/domain/user/avatar";
import { resolvePreferences } from "@/domain/user-preferences/entity";
import { isTwofaAvailable } from "@/domain/settings/auth-settings";
import { DrizzleEmailAddressRepository } from "@/infrastructure/db/repositories/email-address-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserPreferencesRepository } from "@/infrastructure/db/repositories/user-preferences-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { AccessKeysSection } from "./access-keys-section";
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

  return (
    <main className="p-8 flex flex-col gap-6 max-w-lg">
      <div className="flex items-center gap-3">
        {settings.gravatarEnabled ? (
          // eslint-disable-next-line @next/next/no-img-element -- an external Gravatar URL, which next/image would proxy for no benefit
          <img src={gravatarUrl(user.mail, 48)} alt="" width={48} height={48} className="rounded-full" />
        ) : (
          <span className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium">
            {userInitials(user.firstname, user.lastname)}
          </span>
        )}
        <h1 className="text-xl font-semibold">アカウント設定</h1>
      </div>

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
    </main>
  );
}

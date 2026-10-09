import { notFound } from "next/navigation";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { loadCommitKeywordSettings } from "@/application/settings/commit-keyword-settings";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { loadMailHandlerSettings } from "@/application/settings/mail-handler-settings";
import { loadProjectDefaults } from "@/application/settings/project-defaults";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { currentLocale } from "@/interface/http/locale";
import { translate } from "@/domain/i18n/messages";
import { AuthSettingsForm } from "./auth-settings-form";
import { CommitKeywordSettingsForm } from "./commit-keyword-settings-form";
import { GeneralSettingsForm } from "./general-settings-form";
import { MailHandlerSettingsForm } from "./mail-handler-settings-form";
import { RemindersForm } from "./reminders-form";
import { ProjectDefaultsForm } from "./project-defaults-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const locale = await currentLocale();
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const settingsRepository = new DrizzleSettingsRepository();
  const commitKeywordSettings = await loadCommitKeywordSettings(settingsRepository);
  const generalSettings = await loadGeneralSettings(settingsRepository);
  const mailHandlerSettings = await loadMailHandlerSettings(settingsRepository);
  const authSettings = await loadAuthSettings(settingsRepository);
  const [projectDefaults, trackers, roles] = await Promise.all([
    loadProjectDefaults(settingsRepository),
    new DrizzleTrackerRepository().listAll(),
    new DrizzleRoleRepository().listGivable(),
  ]);

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{translate(locale, "admin.settings")}</h1>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{translate(locale, "admin.settings.general")}</h2>
        <GeneralSettingsForm locale={locale} settings={generalSettings} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{translate(locale, "admin.settings.mailHandler")}</h2>
        <p className="text-sm text-gray-500">
          {translate(locale, "admin.settings.mailHandlerIntro")}
        </p>
        <MailHandlerSettingsForm locale={locale} settings={mailHandlerSettings} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{translate(locale, "admin.settings.reminders")}</h2>
        <p className="text-sm text-gray-500">
          {translate(locale, "admin.settings.remindersIntro1")}<code>rake redmine:send_reminders</code>{translate(locale, "admin.settings.remindersIntro2")}
        </p>
        <RemindersForm locale={locale} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{translate(locale, "admin.settings.auth")}</h2>
        <AuthSettingsForm locale={locale} settings={authSettings} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{translate(locale, "admin.settings.projects")}</h2>
        <p className="text-sm text-gray-500">{translate(locale, "admin.settings.projectsIntro")}</p>
        <ProjectDefaultsForm locale={locale} settings={projectDefaults} trackers={trackers} roles={roles} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{translate(locale, "admin.settings.repositories")}</h2>
        <p className="text-sm text-gray-500">{translate(locale, "admin.settings.repositoriesIntro")}</p>
        <CommitKeywordSettingsForm locale={locale} settings={commitKeywordSettings} />
      </section>
    </main>
  );
}

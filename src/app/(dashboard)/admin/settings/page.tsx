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
import { AuthSettingsForm } from "./auth-settings-form";
import { CommitKeywordSettingsForm } from "./commit-keyword-settings-form";
import { GeneralSettingsForm } from "./general-settings-form";
import { MailHandlerSettingsForm } from "./mail-handler-settings-form";
import { RemindersForm } from "./reminders-form";
import { ProjectDefaultsForm } from "./project-defaults-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
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
      <h1 className="text-xl font-semibold">設定</h1>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">全般</h2>
        <GeneralSettingsForm settings={generalSettings} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">受信メール</h2>
        <p className="text-sm text-gray-500">
          メールからチケットを登録・更新するための設定です（POST /api/mail_handler）。
        </p>
        <MailHandlerSettingsForm settings={mailHandlerSettings} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">リマインダーメール</h2>
        <p className="text-sm text-gray-500">
          本家の <code>rake redmine:send_reminders</code> 相当。next-pm には定時起動の仕組みが無いため、ここから手動で（または外部のスケジューラからこの操作を呼び出して）実行します。
        </p>
        <RemindersForm />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">認証</h2>
        <AuthSettingsForm settings={authSettings} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">プロジェクト</h2>
        <p className="text-sm text-gray-500">新しいプロジェクトの既定値です。</p>
        <ProjectDefaultsForm settings={projectDefaults} trackers={trackers} roles={roles} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">リポジトリ</h2>
        <p className="text-sm text-gray-500">コミットメッセージからチケットを更新するためのキーワードです。</p>
        <CommitKeywordSettingsForm settings={commitKeywordSettings} />
      </section>
    </main>
  );
}

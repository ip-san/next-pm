import { notFound } from "next/navigation";
import { loadCommitKeywordSettings } from "@/application/settings/commit-keyword-settings";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { CommitKeywordSettingsForm } from "./commit-keyword-settings-form";
import { GeneralSettingsForm } from "./general-settings-form";

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

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">設定</h1>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">全般</h2>
        <GeneralSettingsForm settings={generalSettings} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">リポジトリ</h2>
        <p className="text-sm text-gray-500">コミットメッセージからチケットを更新するためのキーワードです。</p>
        <CommitKeywordSettingsForm settings={commitKeywordSettings} />
      </section>
    </main>
  );
}

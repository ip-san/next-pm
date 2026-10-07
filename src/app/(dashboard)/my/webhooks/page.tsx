import { notFound, redirect } from "next/navigation";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { WEBHOOK_EVENT_LABELS } from "@/domain/webhook/events";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleWebhookRepository } from "@/infrastructure/db/repositories/webhook-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { listProjectsWithPermission } from "@/interface/http/resolve-actor";
import { DeleteWebhookForm } from "./delete-webhook-form";
import { WebhookForm } from "./webhook-form";

// Per-user data behind a session cookie — never prerender it.
export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const user = await currentUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const { webhooksEnabled } = await loadGeneralSettings(new DrizzleSettingsRepository());
  if (!webhooksEnabled) {
    // Redmine's WebhooksController#check_enabled renders 403; this app's idiom for
    // "the feature isn't on" is the same not-found collapse used elsewhere.
    notFound();
  }

  const projects = await listProjectsWithPermission(user, "use_webhooks");
  if (projects.length === 0) {
    notFound();
  }

  const webhooks = await new DrizzleWebhookRepository().listByUser(user.id);
  const projectName = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <main className="p-8 flex flex-col gap-6 max-w-2xl">
      <h1 className="text-xl font-semibold">Webhook</h1>
      <p className="text-sm text-gray-500">
        自分が見られるデータだけが送信されます。配信はジョブワーカー経由で行われ、失敗した場合は再試行されます。
      </p>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">登録済み</h2>
        {webhooks.length === 0 ? (
          <p className="text-sm text-gray-500">まだ登録されていません。</p>
        ) : (
          webhooks.map((webhook) => (
            <div key={webhook.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-mono break-all">{webhook.url}</span>
                <span className="text-xs text-gray-500">{webhook.active ? "有効" : "無効"}</span>
                <DeleteWebhookForm webhookId={webhook.id} />
              </div>
              <p className="text-xs text-gray-500">
                {webhook.events.map((event) => WEBHOOK_EVENT_LABELS[event]).join(" / ")}
                {" — "}
                {webhook.projectIds.map((projectId) => projectName.get(projectId) ?? projectId).join(", ")}
              </p>
              <WebhookForm webhook={webhook} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">新しいWebhook</h2>
        <WebhookForm webhook={null} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
      </section>
    </main>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { WEBHOOK_SECRET_MAX_LENGTH, WEBHOOK_URL_MAX_LENGTH } from "@/domain/webhook/entity";
import { parseWebhookEndpoint, type EndpointRejection } from "@/domain/webhook/endpoint";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/domain/webhook/events";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleWebhookRepository } from "@/infrastructure/db/repositories/webhook-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { listProjectsWithPermission } from "@/interface/http/resolve-actor";
import { localizeError } from "@/interface/http/localize-error";

export type WebhookActionState = { error: string | null };

const ENDPOINT_ERRORS: Record<EndpointRejection, string> = {
  invalid_url: "URLの形式が正しくありません。",
  unsupported_scheme: "URLは http:// または https:// で始めてください。",
  blocked_port: "このポート番号は使用できません。",
  missing_host: "URLにホスト名が含まれていません。",
  blocked_address: "このアドレスには送信できません。",
};

const webhookSchema = z.object({
  id: z.string().uuid().optional(),
  url: z.string().min(1, "URLを入力してください。").max(WEBHOOK_URL_MAX_LENGTH, "URLが長すぎます。"),
  secret: z.string().max(WEBHOOK_SECRET_MAX_LENGTH, "シークレットは255文字以内で入力してください。"),
  active: z.coerce.boolean().default(false),
  events: z.array(z.enum(WEBHOOK_EVENTS)),
  projectIds: z.array(z.string().uuid()),
});

function formValues(formData: FormData) {
  return {
    id: (formData.get("id") as string) || undefined,
    url: formData.get("url"),
    secret: formData.get("secret") ?? "",
    active: formData.get("active") === "on",
    events: formData.getAll("events").filter((value): value is string => typeof value === "string"),
    projectIds: formData.getAll("projectIds").filter((value): value is string => typeof value === "string"),
  };
}

/**
 * Create/update share one action, as the form does. Two authorization steps, both from
 * Redmine's WebhooksController + `Webhook#setable_projects`: the user needs `use_webhooks`
 * somewhere at all to reach the screen, and the submitted projects are intersected with the
 * ones they hold it on — so a hand-edited form can't attach a hook to a project they can't see.
 */
export async function saveWebhookAction(
  _prevState: WebhookActionState,
  formData: FormData,
): Promise<WebhookActionState> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。") };
  }
  const { webhooksEnabled } = await loadGeneralSettings(new DrizzleSettingsRepository());
  if (!webhooksEnabled) {
    return { error: await localizeError("Webhookは管理者によって無効化されています。") };
  }

  const parsed = webhookSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  const endpoint = parseWebhookEndpoint(parsed.data.url);
  if (!endpoint.ok) {
    return { error: await localizeError(ENDPOINT_ERRORS[endpoint.reason]) };
  }

  const allowedProjects = await listProjectsWithPermission(user, "use_webhooks");
  if (allowedProjects.length === 0) {
    return { error: await localizeError("この操作を行う権限がありません。") };
  }
  const allowedIds = new Set(allowedProjects.map((project) => project.id));
  const projectIds = parsed.data.projectIds.filter((projectId) => allowedIds.has(projectId));
  if (projectIds.length === 0) {
    return { error: await localizeError("対象のプロジェクトを1つ以上選択してください。") };
  }
  if (parsed.data.events.length === 0) {
    return { error: await localizeError("通知するイベントを1つ以上選択してください。") };
  }

  const repository = new DrizzleWebhookRepository();
  const input = {
    url: parsed.data.url,
    secret: parsed.data.secret,
    events: parsed.data.events as WebhookEvent[],
    active: parsed.data.active,
    projectIds,
  };

  if (parsed.data.id) {
    const existing = await repository.findById(parsed.data.id);
    if (!existing || existing.userId !== user.id) {
      return { error: await localizeError("Webhookが見つかりません。") };
    }
    await repository.update(existing.id, input);
  } else {
    await repository.create(user.id, input);
  }

  revalidatePath("/my/webhooks");
  return { error: null };
}

export async function deleteWebhookAction(
  _prevState: WebhookActionState,
  formData: FormData,
): Promise<WebhookActionState> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。") };
  }
  const id = formData.get("id");
  if (typeof id !== "string") {
    return { error: await localizeError("入力内容を確認してください。") };
  }

  const repository = new DrizzleWebhookRepository();
  const existing = await repository.findById(id);
  if (!existing || existing.userId !== user.id) {
    return { error: await localizeError("Webhookが見つかりません。") };
  }
  await repository.delete(existing.id);

  revalidatePath("/my/webhooks");
  return { error: null };
}

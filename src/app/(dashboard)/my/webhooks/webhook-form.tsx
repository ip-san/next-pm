"use client";

import { useActionState } from "react";
import { saveWebhookAction, type WebhookActionState } from "@/interface/actions/webhook-actions";
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS } from "@/domain/webhook/events";
import type { Webhook } from "@/domain/webhook/entity";

const initialState: WebhookActionState = { error: null };

export interface SelectableProject {
  id: string;
  name: string;
}

export function WebhookForm({ webhook, projects }: { webhook: Webhook | null; projects: SelectableProject[] }) {
  const [state, formAction, pending] = useActionState(saveWebhookAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 border rounded p-4">
      {webhook ? <input type="hidden" name="id" value={webhook.id} /> : null}
      <label className="flex flex-col gap-1 text-sm">
        通知先URL
        <input
          type="url"
          name="url"
          required
          defaultValue={webhook?.url ?? ""}
          placeholder="https://example.com/hooks/next-pm"
          className="border rounded px-2 py-1"
        />
        <span className="text-xs text-gray-500">http / https のみ。社内ネットワークやループバック宛のURLは拒否されます。</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        シークレット（任意）
        <input type="text" name="secret" defaultValue={webhook?.secret ?? ""} className="border rounded px-2 py-1" />
        <span className="text-xs text-gray-500">
          入力すると本文のHMAC-SHA256を <code>X-Redmine-Signature-256</code> ヘッダで送ります。
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={webhook?.active ?? false} />
        有効にする
      </label>

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="font-medium">イベント</legend>
        {WEBHOOK_EVENTS.map((event) => (
          <label key={event} className="flex items-center gap-2">
            <input type="checkbox" name="events" value={event} defaultChecked={webhook?.events.includes(event) ?? false} />
            {WEBHOOK_EVENT_LABELS[event]}
            <code className="text-xs text-gray-500">{event}</code>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="font-medium">対象プロジェクト</legend>
        {projects.length === 0 ? (
          <p className="text-sm text-gray-500">Webhookを使用できるプロジェクトがありません。</p>
        ) : (
          projects.map((project) => (
            <label key={project.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="projectIds"
                value={project.id}
                defaultChecked={webhook?.projectIds.includes(project.id) ?? false}
              />
              {project.name}
            </label>
          ))
        )}
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start"
      >
        {pending ? "保存中…" : webhook ? "更新" : "追加"}
      </button>
    </form>
  );
}

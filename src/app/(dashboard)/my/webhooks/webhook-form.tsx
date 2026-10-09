"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { saveWebhookAction, type WebhookActionState } from "@/interface/actions/webhook-actions";
import { WEBHOOK_EVENTS } from "@/domain/webhook/events";
import type { Webhook } from "@/domain/webhook/entity";

const initialState: WebhookActionState = { error: null };

export interface SelectableProject {
  id: string;
  name: string;
}

export function WebhookForm({ locale = "ja", webhook, projects }: { webhook: Webhook | null; projects: SelectableProject[]; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(saveWebhookAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 border rounded p-4">
      {webhook ? <input type="hidden" name="id" value={webhook.id} /> : null}
      <label className="flex flex-col gap-1 text-sm">
        {translate(locale, "webhooks.url")}
        <input
          type="url"
          name="url"
          required
          defaultValue={webhook?.url ?? ""}
          placeholder="https://example.com/hooks/next-pm"
          className="border rounded px-2 py-1"
        />
        <span className="text-xs text-gray-500">{translate(locale, "webhooks.urlHelp")}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {translate(locale, "webhooks.secret")}
        <input type="text" name="secret" defaultValue={webhook?.secret ?? ""} className="border rounded px-2 py-1" />
        <span className="text-xs text-gray-500">
          {translate(locale, "webhooks.secretHelpPre")}<code>X-Redmine-Signature-256</code>{translate(locale, "webhooks.secretHelpPost")}
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={webhook?.active ?? false} />
        {translate(locale, "webhooks.enable")}
      </label>

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="font-medium">{translate(locale, "webhooks.events")}</legend>
        {WEBHOOK_EVENTS.map((event) => (
          <label key={event} className="flex items-center gap-2">
            <input type="checkbox" name="events" value={event} defaultChecked={webhook?.events.includes(event) ?? false} />
            {t(`webhooks.event.${event}`)}
            <code className="text-xs text-gray-500">{event}</code>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="font-medium">{translate(locale, "webhooks.projects")}</legend>
        {projects.length === 0 ? (
          <p className="text-sm text-gray-500">{translate(locale, "webhooks.noProjects")}</p>
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
        {pending ? t("issue.saving") : webhook ? t("issueForm.update") : t("issue.add")}
      </button>
    </form>
  );
}

"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import type { IssueStatus } from "@/domain/issue-status/entity";
import { createIssueStatusAction, updateIssueStatusAction } from "@/interface/actions/admin-issue-status-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";

const initialState: AdminActionState = { error: null };

/** Doubles as the create form (no `status`) and the edit form, like Redmine's shared `_form` partial. */
export function IssueStatusForm({ locale = "ja", status }: { status?: IssueStatus; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(
    status ? updateIssueStatusAction : createIssueStatusAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      {status ? <input type="hidden" name="statusId" value={status.id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          {t("admin.trackers.name")}
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={30}
          defaultValue={status?.name}
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium">
          {t("issue.attr.description")}
        </label>
        <input
          id="description"
          name="description"
          maxLength={255}
          defaultValue={status?.description}
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="defaultDoneRatio" className="text-sm font-medium">
          {t("admin.issueStatuses.defaultDoneRatioField")}
        </label>
        <input
          id="defaultDoneRatio"
          name="defaultDoneRatio"
          type="number"
          min={0}
          max={100}
          defaultValue={status?.defaultDoneRatio ?? ""}
          className="border rounded px-3 py-2"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isClosed" defaultChecked={status?.isClosed} />
        {t("admin.issueStatuses.isClosed")}
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? t("issue.saving") : status ? t("admin.users.saveChanges") : t("admin.issueStatuses.add")}
      </button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import {
  createTimeEntryAction,
  updateTimeEntryAction,
  type LogTimeActionState,
} from "@/interface/actions/time-entry-actions";
import type { CustomField } from "@/domain/custom-field/entity";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { TimeEntry } from "@/domain/time-entry/entity";
import { CustomFieldInputs } from "./custom-field-inputs";

const initialState: LogTimeActionState = { error: null };

export interface TimeEntryFormIssue {
  id: string;
  subject: string;
}

export interface TimeEntryFormUser {
  id: string;
  name: string;
}

/**
 * Shared by the standalone "log time" page and the edit page — Redmine serves both from the
 * same `timelog/_form` partial, and the fields only differ by which action they post to.
 */
export function TimeEntryForm({
  projectIdentifier,
  issues,
  activities,
  customFields,
  assignableUsers,
  currentUserId,
  entry,
  customValues,
}: {
  projectIdentifier: string;
  issues: TimeEntryFormIssue[];
  activities: Enumeration[];
  customFields: CustomField[];
  /** Empty unless the actor holds log_time_for_other_users — then the user picker is shown. */
  assignableUsers: TimeEntryFormUser[];
  /** Preselected in the user picker on a new entry, matching Redmine's `:user => User.current`. */
  currentUserId: string;
  entry?: TimeEntry;
  customValues?: Record<string, string | null>;
}) {
  const [state, formAction, pending] = useActionState(
    entry ? updateTimeEntryAction : createTimeEntryAction,
    initialState,
  );
  const defaultActivityId = entry?.activityId ?? activities.find((activity) => activity.isDefault)?.id ?? activities[0]?.id;

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      {entry ? <input type="hidden" name="entryId" value={entry.id} /> : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="spentOn" className="text-sm font-medium">
          日付
        </label>
        <input
          id="spentOn"
          name="spentOn"
          type="date"
          required
          defaultValue={entry?.spentOn ?? new Date().toISOString().slice(0, 10)}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="hours" className="text-sm font-medium">
          作業時間
        </label>
        <input
          id="hours"
          name="hours"
          type="number"
          step="0.25"
          min="0"
          required
          defaultValue={entry?.hours}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="issueId" className="text-sm font-medium">
          チケット（任意）
        </label>
        <select id="issueId" name="issueId" defaultValue={entry?.issueId ?? ""} className="border rounded px-3 py-2">
          <option value="">(プロジェクト全体)</option>
          {issues.map((issue) => (
            <option key={issue.id} value={issue.id}>
              #{issue.id.slice(0, 8)} {issue.subject}
            </option>
          ))}
        </select>
      </div>

      {assignableUsers.length > 0 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="userId" className="text-sm font-medium">
            ユーザー
          </label>
          <select id="userId" name="userId" defaultValue={entry?.userId ?? currentUserId} className="border rounded px-3 py-2">
            {assignableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="activityId" className="text-sm font-medium">
          作業分類
        </label>
        <select id="activityId" name="activityId" required defaultValue={defaultActivityId} className="border rounded px-3 py-2">
          {activities.map((activity) => (
            <option key={activity.id} value={activity.id}>
              {activity.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="comments" className="text-sm font-medium">
          コメント
        </label>
        <input id="comments" name="comments" defaultValue={entry?.comments} className="border rounded px-3 py-2" />
      </div>

      <CustomFieldInputs fields={customFields} values={customValues} />

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "保存中…" : entry ? "更新" : "工数を記録"}
      </button>
    </form>
  );
}

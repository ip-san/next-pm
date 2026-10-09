"use client";

import { customFieldChoiceOptions } from "@/domain/custom-field/choices";
import { useActionState, useState } from "react";
import { bulkUpdateIssuesAction, type BulkEditActionState } from "@/interface/actions/bulk-edit-actions";
import { CustomFieldInputs } from "../custom-field-inputs";
import type { IssueStatus } from "@/domain/issue-status/entity";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { User } from "@/domain/user/entity";
import type { Group } from "@/domain/group/entity";
import type { Tracker } from "@/domain/tracker/entity";
import type { IssueCategory } from "@/domain/issue-category/entity";
import type { Version } from "@/domain/version/entity";
import type { CustomField } from "@/domain/custom-field/entity";
import type { Locale } from "@/domain/i18n/locales";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: BulkEditActionState = { error: null, message: null };

export function BulkEditForm({
  projectIdentifier,
  issueIds,
  trackers,
  statuses,
  priorities,
  members,
  groups,
  categories,
  versions,
  customFields,
  canSetNotesPrivate,
  locale = "ja",
}: {
  projectIdentifier: string;
  issueIds: string[];
  trackers: Tracker[];
  statuses: IssueStatus[];
  priorities: Enumeration[];
  members: User[];
  groups: Group[];
  categories: IssueCategory[];
  versions: Version[];
  /** The fields every selected issue's tracker enables (Issue.available_custom_fields). */
  customFields: CustomField[];
  canSetNotesPrivate: boolean;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(bulkUpdateIssuesAction, initialState);
  // Blank means "leave it alone", so an empty value is simply not submitted.
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      {issueIds.map((id) => (
        <input key={id} type="hidden" name="issueIds" value={id} />
      ))}

      <div className="flex flex-col gap-1">
        <label htmlFor="trackerId" className="text-sm font-medium">
          {t("query.column.tracker")}
        </label>
        <select id="trackerId" name="trackerId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">{t("bulkEdit.noChange")}</option>
          {trackers.map((tracker) => (
            <option key={tracker.id} value={tracker.id}>
              {tracker.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="statusId" className="text-sm font-medium">
          {t("query.column.status")}
        </label>
        <select id="statusId" name="statusId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">{t("bulkEdit.noChange")}</option>
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="priorityId" className="text-sm font-medium">
          {t("query.column.priority")}
        </label>
        <select id="priorityId" name="priorityId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">{t("bulkEdit.noChange")}</option>
          {priorities.map((priority) => (
            <option key={priority.id} value={priority.id}>
              {priority.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="categoryId" className="text-sm font-medium">
          {t("query.column.category")}
        </label>
        <select id="categoryId" name="categoryId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">{t("bulkEdit.noChange")}</option>
          <option value="__none__">{t("query.none")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fixedVersionId" className="text-sm font-medium">
          {t("query.column.fixed_version")}
        </label>
        <select id="fixedVersionId" name="fixedVersionId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">{t("bulkEdit.noChange")}</option>
          <option value="__none__">{t("query.none")}</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="assignedToId" className="text-sm font-medium">
          {t("query.column.assigned_to")}
        </label>
        <select id="assignedToId" name="assignedToId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">{t("bulkEdit.noChange")}</option>
          <option value="__none__">{t("issueBulkEdit.unassign")}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.lastname} {member.firstname}
            </option>
          ))}
          {groups.map((group) => (
            <option key={group.id} value={`group:${group.id}`}>
              {interpolate(t("issues.groupName"), { name: group.name })}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="startDate" className="text-sm font-medium">
          {t("query.column.start_date")}
        </label>
        <input id="startDate" name="startDate" type="date" className="border rounded px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="dueDate" className="text-sm font-medium">
          {t("query.column.due_date")}
        </label>
        <input id="dueDate" name="dueDate" type="date" className="border rounded px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="doneRatio" className="text-sm font-medium">
          {t("issueBulkEdit.doneRatio")}
        </label>
        <input id="doneRatio" name="doneRatio" type="number" min={0} max={100} step={10} className="border rounded px-3 py-2" />
      </div>

      <CustomFieldInputs
        choices={customFieldChoiceOptions(customFields, { users: members.map((member) => ({ value: member.id, label: `${member.lastname} ${member.firstname}` })), versions: versions.map((version) => ({ value: version.id, label: version.name })) })}
        fields={customFields}
        values={customFieldValues}
        onChange={(customFieldId, value) => setCustomFieldValues((current) => ({ ...current, [customFieldId]: value }))}
        idPrefix="bulk"
      />
      {customFields.map((field) =>
        customFieldValues[field.id] ? <input key={field.id} type="hidden" name={`cf_${field.id}`} value={customFieldValues[field.id]} /> : null,
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium">
          {t("issue.comment")}
        </label>
        <textarea id="notes" name="notes" rows={3} className="border rounded px-3 py-2" />
      </div>
      {canSetNotesPrivate ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="privateNotes" />
          {t("issueBulkEdit.privateNotes")}
        </label>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p className="text-sm text-green-700">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? t("bulkEdit.submitting") : t("bulkEdit.submit")}
      </button>
    </form>
  );
}

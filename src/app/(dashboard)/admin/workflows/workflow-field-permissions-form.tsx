"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { updateFieldPermissionsAction, type AdminActionState } from "@/interface/actions/admin-actions";
import { WORKFLOW_ELIGIBLE_FIELDS, type FieldPermissionRule, type WorkflowEligibleField } from "@/domain/workflow/entity";
import type { IssueStatus } from "@/domain/issue-status/entity";

const initialState: AdminActionState = { error: null };

const FIELD_LABEL_KEYS: Record<WorkflowEligibleField, MessageKey> = {
  subject: "issue.attr.subject",
  description: "issue.attr.description",
  assignedToId: "issue.attr.assignedToId",
  priorityId: "issue.attr.priorityId",
  categoryId: "issue.attr.categoryId",
  fixedVersionId: "issue.attr.fixedVersionId",
  startDate: "issue.attr.startDate",
  dueDate: "issue.attr.dueDate",
  doneRatio: "issue.attr.doneRatio",
  estimatedHours: "issue.attr.estimatedHours",
  isPrivate: "issue.attr.isPrivate",
};

/**
 * Fields (rows) × statuses (columns) grid — mirrors Redmine's workflows/permissions tab, but
 * scoped to a single tracker+role at a time (this page's existing selection model), so there's
 * no need for Redmine's multi-select bulk-edit "no_change" tri-state: every cell has one
 * definite value given the fixed scope.
 */
export function WorkflowFieldPermissionsForm({
  trackerId,
  roleId,
  statuses,
  ruleByCell,
  locale = "ja",
}: {
  trackerId: string;
  roleId: string;
  statuses: IssueStatus[];
  ruleByCell: Array<[string, FieldPermissionRule]>;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateFieldPermissionsAction, initialState);
  const rules = new Map(ruleByCell);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="trackerId" value={trackerId} />
      <input type="hidden" name="roleId" value={roleId} />

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr>
              <th className="border px-2 py-1 bg-gray-50 text-left">{t("admin.workflows.fieldHeader")}</th>
              {statuses.map((status) => (
                <th key={status.id} className="border px-2 py-1 bg-gray-50 whitespace-nowrap">
                  {status.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WORKFLOW_ELIGIBLE_FIELDS.map((field) => (
              <tr key={field}>
                <th className="border px-2 py-1 bg-gray-50 text-left whitespace-nowrap">{translate(locale, FIELD_LABEL_KEYS[field])}</th>
                {statuses.map((status) => {
                  const cellKey = `${status.id}:${field}`;
                  return (
                    <td key={status.id} className="border px-2 py-1 text-center">
                      <select
                        name={`perm:${cellKey}`}
                        defaultValue={rules.get(cellKey) ?? ""}
                        className="border rounded px-1 py-0.5 text-xs"
                      >
                        <option value="">{t("admin.workflows.ruleEditable")}</option>
                        <option value="readonly">{t("admin.workflows.ruleReadonly")}</option>
                        <option value="required">{t("admin.workflows.ruleRequired")}</option>
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
        {pending ? t("issue.saving") : t("issue.save")}
      </button>
    </form>
  );
}

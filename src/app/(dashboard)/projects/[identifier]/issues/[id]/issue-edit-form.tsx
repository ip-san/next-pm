"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { updateIssueFormAction } from "@/interface/actions/issue-actions";
import type { UpdateIssueFormValues } from "@/interface/actions/issue-schemas";
import type { CustomField } from "@/domain/custom-field/entity";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { Group } from "@/domain/group/entity";
import type { Issue } from "@/domain/issue/entity";
import type { IssueCategory } from "@/domain/issue-category/entity";
import type { IssueStatus } from "@/domain/issue-status/entity";
import type { Tracker } from "@/domain/tracker/entity";
import type { User } from "@/domain/user/entity";
import type { Version } from "@/domain/version/entity";
import type { WorkflowFieldPermission, WorkflowTransition } from "@/domain/workflow/entity";
import { workflowRuleByAttribute } from "@/domain/workflow/field-permission-rules";
import { allowedNewStatusIds } from "@/domain/workflow/transition-rules";
import { IssueAutocomplete } from "../issue-autocomplete";
import { CustomFieldInputs } from "../custom-field-inputs";

interface FormState {
  trackerId: string;
  statusId: string;
  priorityId: string;
  subject: string;
  description: string;
  assignedToId: string;
  categoryId: string;
  fixedVersionId: string;
  isPrivate: boolean;
  startDate: string;
  dueDate: string;
  estimatedHours: string;
  doneRatio: string;
  notes: string;
  customFieldValues: Record<string, string>;
}

/**
 * The single-issue counterpart to Redmine's `issues/_form` + `issues/_attributes`: every
 * attribute the workflow leaves writable, plus custom field values and a note, in one
 * submission handled by `updateIssueFormAction`.
 *
 * Read-only and required marks are recomputed in the browser whenever the tracker or status
 * changes, because the server keys workflow field permissions on the status the issue will
 * have *after* the update (Redmine's `Issue#safe_attributes=` assigns status_id before
 * consulting `workflow_rule_by_attribute`). Leaving the marks on the pre-edit status would
 * grey out a field the submission is about to require. The rules are re-derived server-side
 * regardless — this only keeps the form honest about what will be accepted.
 */
export function IssueEditForm({
  issue,
  parentIssueLabel,
  projectIdentifier,
  trackers,
  statuses,
  transitions,
  fieldPermissions,
  roleIds,
  isAuthor,
  isAssignee,
  priorities,
  categories,
  versions,
  members,
  groups,
  currentAssigneeLabel,
  customFields,
  customValues,
  doneRatioEditable,
  canSetPrivate,
  canManageSubtasks,
  derivedFields,
}: {
  issue: Issue;
  parentIssueLabel: string | null;
  projectIdentifier: string;
  trackers: Tracker[];
  statuses: IssueStatus[];
  /** Every transition of every tracker in the project — filtered client-side by the selected tracker. */
  transitions: WorkflowTransition[];
  /** Likewise for field permissions, so switching trackers doesn't need a round trip. */
  fieldPermissions: WorkflowFieldPermission[];
  roleIds: string[];
  isAuthor: boolean;
  isAssignee: boolean;
  priorities: Enumeration[];
  categories: IssueCategory[];
  versions: Version[];
  /** Assignable principals — project members only, as Redmine's `assignable_users` resolves. */
  members: User[];
  groups: Group[];
  /** Display name for the stored assignee, who may no longer be a project member. */
  currentAssigneeLabel: string;
  customFields: CustomField[];
  customValues: Record<string, string>;
  /** False when the `issue_done_ratio` setting derives the ratio from the status. */
  doneRatioEditable: boolean;
  /** `set_issues_private`, or `set_own_issues_private` when the viewer authored the issue. */
  canSetPrivate: boolean;
  /** `manage_subtasks` — without it the parent field isn't offered, as in Redmine. */
  canManageSubtasks: boolean;
  /**
   * Attributes this issue derives from its subtasks (the `parent_issue_*` settings, which
   * only apply to a non-leaf issue). Redmine drops them from safe_attribute_names, so they
   * render read-only here and are never submitted.
   */
  derivedFields: { dates: boolean; priority: boolean; doneRatio: boolean };
}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({
    trackerId: issue.trackerId,
    statusId: issue.statusId,
    priorityId: issue.priorityId,
    subject: issue.subject,
    description: issue.description,
    assignedToId:
      issue.assignedToId === null ? "" : issue.assignedToType === "group" ? `group:${issue.assignedToId}` : issue.assignedToId,
    categoryId: issue.categoryId ?? "",
    fixedVersionId: issue.fixedVersionId ?? "",
    isPrivate: issue.isPrivate,
    startDate: issue.startDate ?? "",
    dueDate: issue.dueDate ?? "",
    estimatedHours: issue.estimatedHours === null ? "" : String(issue.estimatedHours),
    doneRatio: String(issue.doneRatio),
    notes: "",
    customFieldValues: customValues,
  });
  // The parent picker starts empty and only reports a value once the user touches it. The
  // stored parent is deliberately not seeded into client state: it may be an issue this
  // viewer can't see (its subject is already withheld from `parentIssueLabel`, and shipping
  // its id would disclose that it exists), and an untouched picker must leave the existing
  // parent alone rather than submit "" and silently detach it.
  const [parentId, setParentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((previous) => ({ ...previous, [key]: value }));

  // Keyed on the issue's *stored* status, not the pending selection — the server validates
  // the transition from where the issue is now.
  const allowedStatuses = useMemo(() => {
    const ids = allowedNewStatusIds(transitions, {
      trackerId: state.trackerId,
      roleIds,
      currentStatusId: issue.statusId,
      isAuthor,
      isAssignee,
    });
    return statuses.filter((status) => ids.includes(status.id));
  }, [transitions, state.trackerId, roleIds, issue.statusId, isAuthor, isAssignee, statuses]);

  const applicableCustomFields = useMemo(
    () => customFields.filter((field) => field.trackerIds.includes(state.trackerId)),
    [customFields, state.trackerId],
  );

  const statusName = statuses.find((status) => status.id === issue.statusId)?.name ?? "?";

  // Switching trackers can drop the selected status out of the allowed set (each tracker has
  // its own workflow). Redmine reloads the whole form and re-picks a valid status; derived
  // here instead, so a submit can't carry a transition the new tracker never allowed.
  const selectedStatusId = allowedStatuses.some((status) => status.id === state.statusId) ? state.statusId : issue.statusId;

  const rules = useMemo(
    () => workflowRuleByAttribute(fieldPermissions, { trackerId: state.trackerId, statusId: selectedStatusId, roleIds }),
    [fieldPermissions, state.trackerId, selectedStatusId, roleIds],
  );
  const derivedByParentRollup: Partial<Record<keyof typeof rules, boolean>> = {
    startDate: derivedFields.dates,
    dueDate: derivedFields.dates,
    priorityId: derivedFields.priority,
    doneRatio: derivedFields.doneRatio,
  };
  const isReadOnly = (field: keyof typeof rules) => rules[field] === "readonly" || derivedByParentRollup[field] === true;
  const isRequired = (field: keyof typeof rules) => rules[field] === "required";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);

    // A field the workflow marks read-only is never submitted: `updateIssueFormAction` reads
    // an absent key as "untouched", so omitting it is what keeps a disabled field from being
    // journalled as a change to blank.
    const values: UpdateIssueFormValues = {
      issueId: issue.id,
      lockVersion: issue.lockVersion,
      trackerId: state.trackerId,
      notes: state.notes,
      customFieldValues: Object.fromEntries(
        applicableCustomFields.map((field) => [field.id, state.customFieldValues[field.id] ?? ""]),
      ),
    };
    if (canManageSubtasks && parentId !== null) values.parentId = parentId;
    if (allowedStatuses.length > 0) values.statusId = selectedStatusId;
    if (!isReadOnly("subject")) values.subject = state.subject;
    if (!isReadOnly("description")) values.description = state.description;
    if (!isReadOnly("priorityId")) values.priorityId = state.priorityId;
    if (!isReadOnly("assignedToId")) values.assignedToId = state.assignedToId;
    if (!isReadOnly("categoryId")) values.categoryId = state.categoryId;
    if (!isReadOnly("fixedVersionId")) values.fixedVersionId = state.fixedVersionId;
    if (!isReadOnly("startDate")) values.startDate = state.startDate;
    if (!isReadOnly("dueDate")) values.dueDate = state.dueDate;
    if (!isReadOnly("estimatedHours")) values.estimatedHours = state.estimatedHours;
    if (canSetPrivate && !isReadOnly("isPrivate")) values.isPrivate = state.isPrivate;
    if (doneRatioEditable && !isReadOnly("doneRatio")) values.doneRatio = state.doneRatio;

    const result = await updateIssueFormAction(values);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    set("notes", "");
    router.refresh();
  }

  const label = (field: keyof typeof rules, text: string) => (
    <>
      {text}
      {isRequired(field) ? <span className="text-red-600"> *</span> : null}
    </>
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-xl">
      <div className="flex flex-col gap-1">
        <label htmlFor="trackerId" className="text-sm font-medium">
          トラッカー
        </label>
        <select
          id="trackerId"
          value={state.trackerId}
          onChange={(event) => set("trackerId", event.target.value)}
          className="border rounded px-3 py-2"
        >
          {trackers.map((tracker) => (
            <option key={tracker.id} value={tracker.id}>
              {tracker.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="statusId" className="text-sm font-medium">
          ステータス
        </label>
        {allowedStatuses.length > 0 ? (
          <select
            id="statusId"
            value={selectedStatusId}
            onChange={(event) => set("statusId", event.target.value)}
            className="border rounded px-3 py-2"
          >
            {allowedStatuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
        ) : (
          // Mirrors Redmine's _attributes partial falling back to a plain label when
          // new_statuses_allowed_to is empty — the rest of the form stays editable.
          <p className="text-sm">{statusName}（遷移できるステータスがありません）</p>
        )}
      </div>

      {isReadOnly("subject") ? (
        <ReadOnlyField label="件名" value={issue.subject} />
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="subject" className="text-sm font-medium">
            {label("subject", "件名")}
          </label>
          <input
            id="subject"
            value={state.subject}
            onChange={(event) => set("subject", event.target.value)}
            className="border rounded px-3 py-2"
          />
        </div>
      )}

      {isReadOnly("description") ? (
        <ReadOnlyField label="説明" value={issue.description} />
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-sm font-medium">
            {label("description", "説明")}
          </label>
          <textarea
            id="description"
            value={state.description}
            onChange={(event) => set("description", event.target.value)}
            rows={6}
            className="border rounded px-3 py-2"
          />
        </div>
      )}

      {isReadOnly("priorityId") ? (
        <ReadOnlyField label="優先度" value={priorities.find((p) => p.id === issue.priorityId)?.name ?? "?"} />
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="priorityId" className="text-sm font-medium">
            {label("priorityId", "優先度")}
          </label>
          <select
            id="priorityId"
            value={state.priorityId}
            onChange={(event) => set("priorityId", event.target.value)}
            className="border rounded px-3 py-2"
          >
            {priorities.map((priority) => (
              <option key={priority.id} value={priority.id}>
                {priority.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {isReadOnly("assignedToId") ? (
        <ReadOnlyField label="担当者" value={currentAssigneeLabel} />
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="assignedToId" className="text-sm font-medium">
            {label("assignedToId", "担当者")}
          </label>
          <select
            id="assignedToId"
            value={state.assignedToId}
            onChange={(event) => set("assignedToId", event.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="">(未割当)</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.lastname} {member.firstname}
              </option>
            ))}
            {groups.map((group) => (
              <option key={group.id} value={`group:${group.id}`}>
                {group.name}（グループ）
              </option>
            ))}
            {/* The current assignee may have left the project; keep them selectable so saving
                an unrelated field doesn't silently reassign the issue. */}
            {state.assignedToId !== "" &&
            !members.some((member) => member.id === state.assignedToId) &&
            !groups.some((group) => `group:${group.id}` === state.assignedToId) ? (
              <option value={state.assignedToId}>{currentAssigneeLabel}</option>
            ) : null}
          </select>
        </div>
      )}

      {isReadOnly("categoryId") ? (
        <ReadOnlyField label="カテゴリ" value={categories.find((c) => c.id === issue.categoryId)?.name ?? "(なし)"} />
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="categoryId" className="text-sm font-medium">
            {label("categoryId", "カテゴリ")}
          </label>
          <select
            id="categoryId"
            value={state.categoryId}
            onChange={(event) => set("categoryId", event.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="">(なし)</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {isReadOnly("fixedVersionId") ? (
        <ReadOnlyField label="対象バージョン" value={versions.find((v) => v.id === issue.fixedVersionId)?.name ?? "(なし)"} />
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="fixedVersionId" className="text-sm font-medium">
            {label("fixedVersionId", "対象バージョン")}
          </label>
          <select
            id="fixedVersionId"
            value={state.fixedVersionId}
            onChange={(event) => set("fixedVersionId", event.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="">(なし)</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {canManageSubtasks ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="parentId" className="text-sm font-medium">
            親チケット
          </label>
          <IssueAutocomplete
            projectIdentifier={projectIdentifier}
            inputId="parentId"
            inputName="parentId"
            initialLabel={parentIssueLabel ?? ""}
            onSelect={(issueId) => setParentId(issueId)}
          />
        </div>
      ) : null}

      <div className="flex gap-4 flex-wrap">
        {isReadOnly("startDate") ? (
          <ReadOnlyField label="開始日" value={issue.startDate ?? "(なし)"} />
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor="startDate" className="text-sm font-medium">
              {label("startDate", "開始日")}
            </label>
            <input
              id="startDate"
              type="date"
              value={state.startDate}
              onChange={(event) => set("startDate", event.target.value)}
              className="border rounded px-3 py-2"
            />
          </div>
        )}
        {isReadOnly("dueDate") ? (
          <ReadOnlyField label="期日" value={issue.dueDate ?? "(なし)"} />
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor="dueDate" className="text-sm font-medium">
              {label("dueDate", "期日")}
            </label>
            <input
              id="dueDate"
              type="date"
              value={state.dueDate}
              onChange={(event) => set("dueDate", event.target.value)}
              className="border rounded px-3 py-2"
            />
          </div>
        )}
        {isReadOnly("estimatedHours") ? (
          <ReadOnlyField label="予定工数" value={issue.estimatedHours === null ? "(なし)" : String(issue.estimatedHours)} />
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor="estimatedHours" className="text-sm font-medium">
              {label("estimatedHours", "予定工数")}
            </label>
            <input
              id="estimatedHours"
              type="number"
              min="0"
              step="0.1"
              value={state.estimatedHours}
              onChange={(event) => set("estimatedHours", event.target.value)}
              className="border rounded px-3 py-2"
            />
          </div>
        )}
        {/* Mirrors Redmine's `Issue.use_field_for_done_ratio?` guard: with the setting on
            "issue_status" the ratio follows the status and the field is not shown at all.
            The 10-point step is Redmine's default issue_done_ratio_interval, which next-pm
            has no setting for. */}
        {doneRatioEditable && !isReadOnly("doneRatio") ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="doneRatio" className="text-sm font-medium">
              {label("doneRatio", "進捗率")}
            </label>
            <select
              id="doneRatio"
              value={state.doneRatio}
              onChange={(event) => set("doneRatio", event.target.value)}
              className="border rounded px-3 py-2"
            >
              {DONE_RATIO_OPTIONS.map((ratio) => (
                <option key={ratio} value={String(ratio)}>
                  {ratio} %
                </option>
              ))}
            </select>
          </div>
        ) : (
          <ReadOnlyField label="進捗率" value={`${issue.doneRatio} %`} />
        )}
      </div>

      {!canSetPrivate || isReadOnly("isPrivate") ? (
        <ReadOnlyField label="プライベート" value={issue.isPrivate ? "はい" : "いいえ"} />
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={state.isPrivate} onChange={(event) => set("isPrivate", event.target.checked)} />
          プライベートチケットにする
        </label>
      )}

      <CustomFieldInputs
        fields={applicableCustomFields}
        values={state.customFieldValues}
        errors={fieldErrors}
        idPrefix="edit"
        onChange={(customFieldId, value) =>
          setState((previous) => ({
            ...previous,
            customFieldValues: { ...previous.customFieldValues, [customFieldId]: value },
          }))
        }
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium">
          コメント
        </label>
        <textarea
          id="notes"
          value={state.notes}
          onChange={(event) => set("notes", event.target.value)}
          rows={3}
          className="border rounded px-3 py-2"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? "更新中…" : "更新"}
      </button>
    </form>
  );
}

const DONE_RATIO_OPTIONS = Array.from({ length: 11 }, (_, index) => index * 10);

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <p className="text-sm whitespace-pre-wrap">{value || "(なし)"}</p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createIssueFormAction } from "@/interface/actions/issue-actions";
import { createIssueFormSchema, type CreateIssueFormValues } from "@/interface/actions/issue-schemas";
import { IssueAutocomplete } from "../issue-autocomplete";
import { CustomFieldInputs } from "../custom-field-inputs";
import type { CustomField } from "@/domain/custom-field/entity";
import type { Tracker } from "@/domain/tracker/entity";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { IssueCategory } from "@/domain/issue-category/entity";
import type { Version } from "@/domain/version/entity";
import type { User } from "@/domain/user/entity";
import type { Group } from "@/domain/group/entity";

export function NewIssueForm({
  identifier,
  projectId,
  trackers,
  priorities,
  members,
  groups,
  categories,
  versions,
  customFields,
  doneRatioEditable,
  canSetPrivate,
  canManageSubtasks,
}: {
  identifier: string;
  projectId: string;
  trackers: Tracker[];
  priorities: Enumeration[];
  members: User[];
  groups: Group[];
  categories: IssueCategory[];
  versions: Version[];
  customFields: CustomField[];
  /** False when the `issue_done_ratio` setting derives the ratio from the status. */
  doneRatioEditable: boolean;
  /** `set_issues_private` or `set_own_issues_private` — the author is the actor on create. */
  canSetPrivate: boolean;
  /** `manage_subtasks` — without it the parent field isn't offered, as in Redmine. */
  canManageSubtasks: boolean;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateIssueFormValues>({
    resolver: zodResolver(createIssueFormSchema),
    defaultValues: {
      projectId,
      trackerId: trackers[0]?.id ?? "",
      priorityId: priorities[0]?.id ?? "",
      subject: "",
      description: "",
      assignedToId: "",
      categoryId: "",
      fixedVersionId: "",
      parentId: "",
      isPrivate: false,
      estimatedHours: "",
      doneRatio: "0",
      startDate: "",
      dueDate: "",
      // Mirrors Redmine's IssuesController#build_new_issue_from_params seeding a new issue
      // with each applicable custom field's default_value.
      customFieldValues: Object.fromEntries(customFields.map((field) => [field.id, field.defaultValue ?? ""])),
    },
  });

  const selectedTrackerId = useWatch({ control, name: "trackerId" });
  const customFieldValues = useWatch({ control, name: "customFieldValues" });
  const applicableCustomFields = customFields.filter((field) => field.trackerIds.includes(selectedTrackerId));

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setFieldErrors({});
    const result = await createIssueFormAction({
      ...values,
      // Only the selected tracker's fields are submitted — a value typed before switching
      // trackers isn't applicable any more and would be dropped server-side anyway.
      customFieldValues: Object.fromEntries(
        applicableCustomFields.map((field) => [field.id, values.customFieldValues[field.id] ?? ""]),
      ),
    });
    if (!result.ok) {
      setServerError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    router.push(`/projects/${identifier}/issues/${result.issueId}`);
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-md">
      <input type="hidden" {...register("projectId")} />

      <div className="flex flex-col gap-1">
        <label htmlFor="trackerId" className="text-sm font-medium">
          トラッカー
        </label>
        <select id="trackerId" {...register("trackerId")} className="border rounded px-3 py-2">
          {trackers.map((tracker) => (
            <option key={tracker.id} value={tracker.id}>
              {tracker.name}
            </option>
          ))}
        </select>
        {errors.trackerId ? <p className="text-sm text-red-600">{errors.trackerId.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="priorityId" className="text-sm font-medium">
          優先度
        </label>
        <select id="priorityId" {...register("priorityId")} className="border rounded px-3 py-2">
          {priorities.map((priority) => (
            <option key={priority.id} value={priority.id}>
              {priority.name}
            </option>
          ))}
        </select>
        {errors.priorityId ? <p className="text-sm text-red-600">{errors.priorityId.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="subject" className="text-sm font-medium">
          件名
        </label>
        <input id="subject" {...register("subject")} className="border rounded px-3 py-2" />
        {errors.subject ? <p className="text-sm text-red-600">{errors.subject.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium">
          説明
        </label>
        <textarea id="description" {...register("description")} className="border rounded px-3 py-2" rows={5} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="assignedToId" className="text-sm font-medium">
          担当者
        </label>
        <select id="assignedToId" {...register("assignedToId")} className="border rounded px-3 py-2">
          <option value="">(未割当)</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.firstname} {member.lastname}
            </option>
          ))}
          {groups.map((group) => (
            <option key={group.id} value={`group:${group.id}`}>
              {group.name}（グループ）
            </option>
          ))}
        </select>
      </div>

      {categories.length > 0 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="categoryId" className="text-sm font-medium">
            カテゴリ
          </label>
          <select id="categoryId" {...register("categoryId")} className="border rounded px-3 py-2">
            <option value="">(なし)</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {versions.length > 0 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="fixedVersionId" className="text-sm font-medium">
            対象バージョン
          </label>
          <select id="fixedVersionId" {...register("fixedVersionId")} className="border rounded px-3 py-2">
            <option value="">(なし)</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {canManageSubtasks ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="parentId" className="text-sm font-medium">
            親チケット
          </label>
          <IssueAutocomplete
            projectIdentifier={identifier}
            inputId="parentId"
            inputName="parentId"
            onSelect={(issueId) => setValue("parentId", issueId)}
          />
          {errors.parentId ? <p className="text-sm text-red-600">{errors.parentId.message}</p> : null}
        </div>
      ) : null}

      <div className="flex gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="startDate" className="text-sm font-medium">
            開始日
          </label>
          <input id="startDate" type="date" {...register("startDate")} className="border rounded px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="dueDate" className="text-sm font-medium">
            期日
          </label>
          <input id="dueDate" type="date" {...register("dueDate")} className="border rounded px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="estimatedHours" className="text-sm font-medium">
            予定工数
          </label>
          <input id="estimatedHours" type="number" min="0" step="0.1" {...register("estimatedHours")} className="border rounded px-3 py-2" />
        </div>
        {doneRatioEditable ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="doneRatio" className="text-sm font-medium">
              進捗率
            </label>
            {/* Mirrors Redmine's `Issue.use_field_for_done_ratio?` guard, with its default
                issue_done_ratio_interval of 10 (next-pm has no setting for the interval). */}
            <select id="doneRatio" {...register("doneRatio")} className="border rounded px-3 py-2">
              {Array.from({ length: 11 }, (_, index) => index * 10).map((ratio) => (
                <option key={ratio} value={String(ratio)}>
                  {ratio} %
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {canSetPrivate ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("isPrivate")} />
          プライベートチケットにする
        </label>
      ) : null}

      <CustomFieldInputs
        fields={applicableCustomFields}
        values={customFieldValues}
        errors={fieldErrors}
        idPrefix="new"
        onChange={(customFieldId, value) =>
          setValue("customFieldValues", { ...customFieldValues, [customFieldId]: value })
        }
      />

      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}

      <button type="submit" disabled={isSubmitting} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {isSubmitting ? "作成中…" : "チケットを作成"}
      </button>
    </form>
  );
}

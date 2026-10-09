"use client";

import { customFieldChoiceOptions } from "@/domain/custom-field/choices";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createIssueFormAction } from "@/interface/actions/issue-actions";
import { createIssueFormSchema, type CreateIssueFormValues } from "@/interface/actions/issue-schemas";
import { IssueAutocomplete } from "../issue-autocomplete";
import { CustomFieldInputs } from "../custom-field-inputs";
import type { Locale } from "@/domain/i18n/locales";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";
import { isCoreFieldDisabled, type TrackerCoreField } from "@/domain/tracker/core-fields";
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
  locale,
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
  locale: Locale;
}) {
  const router = useRouter();
  const t = (key: MessageKey) => translate(locale, key);
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
  // A core field the selected tracker switched off isn't offered; createIssue drops it
  // server-side regardless, so this only keeps the form honest.
  const selectedTracker = trackers.find((candidate) => candidate.id === selectedTrackerId);
  const off = (field: TrackerCoreField) => selectedTracker !== undefined && isCoreFieldDisabled(selectedTracker, field);

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
          {t("issue.attr.trackerId")}
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

      {off("priorityId") ? null : (
      <div className="flex flex-col gap-1">
        <label htmlFor="priorityId" className="text-sm font-medium">
          {t("issue.attr.priorityId")}
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
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="subject" className="text-sm font-medium">
          {t("issue.attr.subject")}
        </label>
        <input id="subject" {...register("subject")} className="border rounded px-3 py-2" />
        {errors.subject ? <p className="text-sm text-red-600">{errors.subject.message}</p> : null}
      </div>

      {off("description") ? null : (
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium">
          {t("issue.attr.description")}
        </label>
        <textarea id="description" {...register("description")} className="border rounded px-3 py-2" rows={5} />
      </div>
      )}

      {off("assignedToId") ? null : (
      <div className="flex flex-col gap-1">
        <label htmlFor="assignedToId" className="text-sm font-medium">
          {t("issue.attr.assignedToId")}
        </label>
        <select id="assignedToId" {...register("assignedToId")} className="border rounded px-3 py-2">
          <option value="">{t("issue.unassigned")}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.firstname} {member.lastname}
            </option>
          ))}
          {groups.map((group) => (
            <option key={group.id} value={`group:${group.id}`}>
              {interpolate(t("issue.groupName"), { name: group.name })}
            </option>
          ))}
        </select>
      </div>
      )}

      {categories.length > 0 && !off("categoryId") ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="categoryId" className="text-sm font-medium">
            {t("issue.attr.categoryId")}
          </label>
          <select id="categoryId" {...register("categoryId")} className="border rounded px-3 py-2">
            <option value="">{t("issue.none")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {versions.length > 0 && !off("fixedVersionId") ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="fixedVersionId" className="text-sm font-medium">
            {t("issue.attr.fixedVersionId")}
          </label>
          <select id="fixedVersionId" {...register("fixedVersionId")} className="border rounded px-3 py-2">
            <option value="">{t("issue.none")}</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {canManageSubtasks && !off("parentId") ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="parentId" className="text-sm font-medium">
            {t("issue.attr.parentId")}
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
        {off("startDate") ? null : (
        <div className="flex flex-col gap-1">
          <label htmlFor="startDate" className="text-sm font-medium">
            {t("issue.attr.startDate")}
          </label>
          <input id="startDate" type="date" {...register("startDate")} className="border rounded px-3 py-2" />
        </div>
        )}
        {off("dueDate") ? null : (
        <div className="flex flex-col gap-1">
          <label htmlFor="dueDate" className="text-sm font-medium">
            {t("issue.attr.dueDate")}
          </label>
          <input id="dueDate" type="date" {...register("dueDate")} className="border rounded px-3 py-2" />
        </div>
        )}
        {off("estimatedHours") ? null : (
        <div className="flex flex-col gap-1">
          <label htmlFor="estimatedHours" className="text-sm font-medium">
            {t("issue.attr.estimatedHours")}
          </label>
          <input id="estimatedHours" type="number" min="0" step="0.1" {...register("estimatedHours")} className="border rounded px-3 py-2" />
        </div>
        )}
        {doneRatioEditable && !off("doneRatio") ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="doneRatio" className="text-sm font-medium">
              {t("issue.attr.doneRatio")}
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
          {t("issueForm.privateIssue")}
        </label>
      ) : null}

      <CustomFieldInputs
        choices={customFieldChoiceOptions(applicableCustomFields, { users: members.map((member) => ({ value: member.id, label: `${member.lastname} ${member.firstname}` })), versions: versions.map((version) => ({ value: version.id, label: version.name })) })}
        fields={applicableCustomFields}
        values={customFieldValues}
        errors={fieldErrors}
        idPrefix="new"
        locale={locale}
        onChange={(customFieldId, value) =>
          setValue("customFieldValues", { ...customFieldValues, [customFieldId]: value })
        }
      />

      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}

      <button type="submit" disabled={isSubmitting} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {isSubmitting ? t("issueForm.creating") : t("issueForm.create")}
      </button>
    </form>
  );
}

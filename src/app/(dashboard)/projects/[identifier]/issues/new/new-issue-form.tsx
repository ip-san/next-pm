"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createIssueFormAction } from "@/interface/actions/issue-actions";
import { createIssueFormSchema, type CreateIssueFormValues } from "@/interface/actions/issue-schemas";
import { IssueAutocomplete } from "../issue-autocomplete";
import type { Tracker } from "@/domain/tracker/entity";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { IssueCategory } from "@/domain/issue-category/entity";
import type { Version } from "@/domain/version/entity";
import type { User } from "@/domain/user/entity";

export function NewIssueForm({
  identifier,
  projectId,
  trackers,
  priorities,
  members,
  categories,
  versions,
}: {
  identifier: string;
  projectId: string;
  trackers: Tracker[];
  priorities: Enumeration[];
  members: User[];
  categories: IssueCategory[];
  versions: Version[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
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
      startDate: "",
      dueDate: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await createIssueFormAction(values);
    if (!result.ok) {
      setServerError(result.error);
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
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("isPrivate")} />
        プライベートチケットにする
      </label>

      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}

      <button type="submit" disabled={isSubmitting} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {isSubmitting ? "作成中…" : "チケットを作成"}
      </button>
    </form>
  );
}

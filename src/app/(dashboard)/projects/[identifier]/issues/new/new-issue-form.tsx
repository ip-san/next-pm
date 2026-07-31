"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createIssueFormAction } from "@/interface/actions/issue-actions";
import { createIssueFormSchema, type CreateIssueFormValues } from "@/interface/actions/issue-schemas";
import type { Tracker } from "@/domain/tracker/entity";
import type { Enumeration } from "@/domain/enumeration/entity";

export function NewIssueForm({
  identifier,
  projectId,
  trackers,
  priorities,
}: {
  identifier: string;
  projectId: string;
  trackers: Tracker[];
  priorities: Enumeration[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateIssueFormValues>({
    resolver: zodResolver(createIssueFormSchema),
    defaultValues: {
      projectId,
      trackerId: trackers[0]?.id ?? "",
      priorityId: priorities[0]?.id ?? "",
      subject: "",
      description: "",
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

      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}

      <button type="submit" disabled={isSubmitting} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {isSubmitting ? "作成中…" : "チケットを作成"}
      </button>
    </form>
  );
}

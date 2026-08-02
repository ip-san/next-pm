"use client";

import { useActionState } from "react";
import { updateIssueCategoryAction, type IssueCategoryActionState } from "@/interface/actions/issue-category-actions";
import type { IssueCategory } from "@/domain/issue-category/entity";
import type { User } from "@/domain/user/entity";

const initialState: IssueCategoryActionState = { error: null };

export function IssueCategoryEditForm({ projectIdentifier, category, members }: { projectIdentifier: string; category: IssueCategory; members: User[] }) {
  const [state, formAction, pending] = useActionState(updateIssueCategoryAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="categoryId" value={category.id} />
      <input name="name" defaultValue={category.name} maxLength={30} required className="border rounded px-3 py-2 text-sm" />
      <label className="text-xs text-gray-600 flex flex-col gap-1">
        既定の担当者
        <select name="assignedToId" defaultValue={category.assignedToId ?? ""} className="border rounded px-3 py-2 text-sm">
          <option value="">(なし)</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.lastname} {member.firstname}
            </option>
          ))}
        </select>
      </label>
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        保存
      </button>
    </form>
  );
}

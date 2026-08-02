"use client";

import { useActionState } from "react";
import { createIssueCategoryAction, type IssueCategoryActionState } from "@/interface/actions/issue-category-actions";
import type { User } from "@/domain/user/entity";

const initialState: IssueCategoryActionState = { error: null };

export function IssueCategoryCreateForm({ projectIdentifier, members }: { projectIdentifier: string; members: User[] }) {
  const [state, formAction, pending] = useActionState(createIssueCategoryAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md border-t pt-4">
      <h2 className="font-medium text-sm">カテゴリを作成</h2>
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input name="name" placeholder="名前" maxLength={30} required className="border rounded px-3 py-2 text-sm" />
      <label className="text-xs text-gray-600 flex flex-col gap-1">
        既定の担当者
        <select name="assignedToId" defaultValue="" className="border rounded px-3 py-2 text-sm">
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
        作成
      </button>
    </form>
  );
}

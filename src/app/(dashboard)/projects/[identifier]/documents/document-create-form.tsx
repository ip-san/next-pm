"use client";

import { useActionState } from "react";
import { createDocumentAction, type CreateDocumentActionState } from "@/interface/actions/document-actions";
import type { Enumeration } from "@/domain/enumeration/entity";

const initialState: CreateDocumentActionState = { error: null };

export function DocumentCreateForm({ projectIdentifier, categories }: { projectIdentifier: string; categories: Enumeration[] }) {
  const [state, formAction, pending] = useActionState(createDocumentAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md border-t pt-4">
      <h2 className="font-medium text-sm">ドキュメントを追加</h2>
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <select name="categoryId" defaultValue={categories.find((c) => c.isDefault)?.id ?? categories[0]?.id} className="border rounded px-3 py-2 text-sm">
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <input name="title" placeholder="タイトル" maxLength={255} required className="border rounded px-3 py-2 text-sm" />
      <textarea name="description" placeholder="説明" className="border rounded px-3 py-2 text-sm" />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        追加
      </button>
    </form>
  );
}

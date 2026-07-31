"use client";

import { useActionState } from "react";
import { createEnumerationAction, type AdminActionState } from "@/interface/actions/admin-actions";
import type { EnumerationType } from "@/domain/enumeration/entity";

const initialState: AdminActionState = { error: null };

export function EnumerationForm({ type }: { type: EnumerationType }) {
  const [state, formAction, pending] = useActionState(createEnumerationAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap max-w-md">
      <input type="hidden" name="type" value={type} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`${type}-name`} className="text-sm font-medium">
          名称
        </label>
        <input id={`${type}-name`} name="name" required maxLength={30} className="border rounded px-3 py-2" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isDefault" />
        既定値
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 w-full">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? "追加中…" : "追加"}
      </button>
    </form>
  );
}

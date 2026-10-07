"use client";

import { useActionState } from "react";
import { adminActivateUserAction, type AdminActivateUserState } from "@/interface/actions/account-actions";

const initialState: AdminActivateUserState = { error: null };

/** The administrator's half of self_registration mode '2' — Redmine's users list "Activate" link. */
export function ActivateUserButton({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(adminActivateUserAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className="underline disabled:opacity-50">
        {pending ? "有効化中…" : "有効化"}
      </button>
      {state.error ? (
        <span role="alert" className="text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

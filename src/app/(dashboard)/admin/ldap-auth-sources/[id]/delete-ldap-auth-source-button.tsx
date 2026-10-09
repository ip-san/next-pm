"use client";

import { useActionState } from "react";
import { deleteLdapAuthSourceAction, type LdapAuthSourceActionState } from "@/interface/actions/ldap-auth-source-actions";

const initialState: LdapAuthSourceActionState = { error: null };

export function DeleteLdapAuthSourceButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteLdapAuthSourceAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2 items-start">
      <input type="hidden" name="ldapAuthSourceId" value={id} />
      <button type="submit" disabled={pending} className="text-sm text-red-600 underline">
        この認証元を削除
      </button>
      {state.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}

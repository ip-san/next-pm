"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { deleteGroupAction, type GroupActionState } from "@/interface/actions/group-actions";

const initialState: GroupActionState = { error: null };

export function DeleteGroupButton({ locale = "ja", groupId }: { groupId: string; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(deleteGroupAction, initialState);
  const router = useRouter();

  return (
    <form
      action={formAction}
      onSubmit={() => {
        router.push("/admin/groups");
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="border rounded px-3 py-2 text-sm text-red-600">
        {t("admin.groups.delete")}
      </button>
    </form>
  );
}

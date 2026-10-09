"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { createIssueCategoryAction, type IssueCategoryActionState } from "@/interface/actions/issue-category-actions";
import type { User } from "@/domain/user/entity";

const initialState: IssueCategoryActionState = { error: null };

export function IssueCategoryCreateForm({ locale = "ja", projectIdentifier, members }: { projectIdentifier: string; members: User[]; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(createIssueCategoryAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md border-t pt-4">
      <h2 className="font-medium text-sm">{t("issueCategories.create")}</h2>
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input name="name" placeholder={t("issueCategories.name")} maxLength={30} required className="border rounded px-3 py-2 text-sm" />
      <label className="text-xs text-gray-600 flex flex-col gap-1">
        {t("issueCategories.defaultAssignee")}
        <select name="assignedToId" defaultValue="" className="border rounded px-3 py-2 text-sm">
          <option value="">{t("query.none")}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.lastname} {member.firstname}
            </option>
          ))}
        </select>
      </label>
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        {t("news.submitCreate")}
      </button>
    </form>
  );
}

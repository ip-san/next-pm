"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { updateGroupCustomFieldValuesAction, type GroupActionState } from "@/interface/actions/group-actions";
import type { CustomField } from "@/domain/custom-field/entity";
import { CustomFieldValueInput } from "@/interface/components/custom-field-value-input";

const initialState: GroupActionState = { error: null };

/** The group's custom field values, edited on the group's own page. */
export function GroupCustomFieldsForm({
  groupId,
  customFields,
  customValueByFieldId,
  locale = "ja",
}: {
  groupId: string;
  customFields: CustomField[];
  customValueByFieldId: Record<string, string | null>;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateGroupCustomFieldValuesAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm border-t pt-4">
      <h2 className="text-sm font-medium">{t("admin.customFields")}</h2>
      <input type="hidden" name="groupId" value={groupId} />
      {customFields.map((field) => (
        <div key={field.id} className="flex flex-col gap-1 text-sm">
          <input type="hidden" name="customFieldIds" value={field.id} />
          <label htmlFor={`customField-${field.id}`}>{field.name}</label>
          <CustomFieldValueInput field={field} defaultValue={customValueByFieldId[field.id] ?? null} />
        </div>
      ))}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? t("issue.saving") : t("issue.save")}
      </button>
    </form>
  );
}

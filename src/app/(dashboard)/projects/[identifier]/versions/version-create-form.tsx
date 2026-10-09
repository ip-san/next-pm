"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { createVersionAction, type VersionActionState } from "@/interface/actions/version-actions";
import type { CustomField } from "@/domain/custom-field/entity";
import { CustomFieldValueInput } from "@/interface/components/custom-field-value-input";

const initialState: VersionActionState = { error: null };

export function VersionCreateForm({ locale = "ja", projectIdentifier, customFields }: { projectIdentifier: string; customFields: CustomField[]; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(createVersionAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md border-t pt-4">
      <h2 className="font-medium text-sm">{t("versions.create")}</h2>
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input name="name" placeholder={t("versions.name")} maxLength={60} required className="border rounded px-3 py-2 text-sm" />
      <textarea name="description" placeholder={t("news.descriptionField")} maxLength={255} className="border rounded px-3 py-2 text-sm" />
      <label className="text-xs text-gray-600 flex flex-col gap-1">
        {t("versions.dueDate")}
        <input type="date" name="effectiveDate" className="border rounded px-3 py-2 text-sm" />
      </label>
      <label className="text-xs text-gray-600 flex flex-col gap-1">
        {t("versions.sharing")}
        <select name="sharing" defaultValue="none" className="border rounded px-3 py-2 text-sm">
          <option value="none">{t("versions.sharingNone")}</option>
          <option value="descendants">{t("versions.sharingDescendants")}</option>
          <option value="hierarchy">{t("versions.sharingHierarchy")}</option>
          <option value="tree">{t("versions.sharingTree")}</option>
          <option value="system">{t("versions.sharingSystem")}</option>
        </select>
      </label>
      {customFields.map((field) => (
        <div key={field.id} className="flex flex-col gap-1 text-xs text-gray-600">
          <input type="hidden" name="customFieldIds" value={field.id} />
          <label htmlFor={`customField-${field.id}`}>{field.name}</label>
          <CustomFieldValueInput field={field} defaultValue={null} />
        </div>
      ))}
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        {t("news.submitCreate")}
      </button>
    </form>
  );
}

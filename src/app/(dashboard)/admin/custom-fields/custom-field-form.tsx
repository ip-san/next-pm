"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState, useState } from "react";
import { createCustomFieldAction, updateCustomFieldAction } from "@/interface/actions/admin-custom-field-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import type { Tracker } from "@/domain/tracker/entity";
import type { Role } from "@/domain/role/entity";
import type { CustomField, CustomizedType } from "@/domain/custom-field/entity";

const initialState: AdminActionState = { error: null };

const FORMAT_OPTIONS = [
  { value: "string", labelKey: "admin.customFields.format.string" },
  { value: "text", labelKey: "admin.customFields.format.text" },
  { value: "int", labelKey: "admin.customFields.format.int" },
  { value: "float", labelKey: "admin.customFields.format.float" },
  { value: "date", labelKey: "admin.customFields.format.date" },
  { value: "bool", labelKey: "admin.customFields.format.bool" },
  { value: "list", labelKey: "admin.customFields.format.list" },
  { value: "link", labelKey: "admin.customFields.format.link" },
  { value: "user", labelKey: "admin.customFields.format.user" },
  { value: "version", labelKey: "admin.customFields.format.version" },
  { value: "enumeration", labelKey: "admin.customFields.format.enumeration" },
] as const;

/** Redmine shows the role-visibility selector for exactly these custom field types. */
const ROLE_VISIBILITY_TYPES: CustomizedType[] = ["Issue", "Project", "TimeEntry", "Version"];

const CUSTOMIZED_TYPE_OPTIONS: { value: CustomizedType; labelKey: MessageKey }[] = [
  { value: "Issue", labelKey: "admin.customFields.type.Issue" },
  { value: "Project", labelKey: "admin.customFields.type.Project" },
  { value: "TimeEntry", labelKey: "admin.customFields.type.TimeEntry" },
  { value: "Version", labelKey: "admin.customFields.type.Version" },
  { value: "Group", labelKey: "admin.customFields.type.Group" },
];

/**
 * Doubles as the create and the edit form. On edit the 対象 and 形式 selects are rendered
 * read-only: Redmine disables the format select for a persisted record and CustomField's STI
 * type never changes, so neither is submitted.
 */
export function CustomFieldForm({ locale = "ja", trackers, roles, field }: { trackers: Tracker[]; roles: Role[]; field?: CustomField; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(
    field ? updateCustomFieldAction : createCustomFieldAction,
    initialState,
  );
  const [customizedType, setCustomizedType] = useState<CustomizedType>(field?.customizedType ?? "Issue");

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md border-t pt-4">
      {field ? <input type="hidden" name="customFieldId" value={field.id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          {t("admin.trackers.name")}
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={30}
          defaultValue={field?.name}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="customizedType" className="text-sm font-medium">
          {t("admin.customFields.target")}
        </label>
        <select
          id="customizedType"
          name={field ? undefined : "customizedType"}
          required
          disabled={Boolean(field)}
          className="border rounded px-3 py-2 disabled:bg-gray-100"
          value={customizedType}
          onChange={(event) => setCustomizedType(event.target.value as CustomizedType)}
        >
          {CUSTOMIZED_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {translate(locale, option.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fieldFormat" className="text-sm font-medium">
          {t("admin.customFields.format")}
        </label>
        <select
          id="fieldFormat"
          name={field ? undefined : "fieldFormat"}
          required
          disabled={Boolean(field)}
          defaultValue={field?.fieldFormat}
          className="border rounded px-3 py-2 disabled:bg-gray-100"
        >
          {FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {translate(locale, option.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="possibleValues" className="text-sm font-medium">
          {t("admin.customFields.possibleValues")}
        </label>
        <input
          id="possibleValues"
          name="possibleValues"
          defaultValue={
            field?.fieldFormat === "enumeration"
              ? (field.enumerations ?? []).filter((choice) => choice.active).map((choice) => choice.name).join(", ")
              : field?.possibleValues.join(", ")
          }
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="defaultValue" className="text-sm font-medium">
          {t("admin.customFields.defaultValue")}
        </label>
        <input
          id="defaultValue"
          name="defaultValue"
          defaultValue={field?.defaultValue ?? ""}
          className="border rounded px-3 py-2"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isRequired" defaultChecked={field?.isRequired} />
        {t("admin.customFields.isRequired")}
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="multiple" defaultChecked={field?.multiple} />
        {t("admin.customFields.multiple")}
      </label>

      <fieldset className="flex flex-col gap-1" hidden={customizedType !== "Issue"}>
        <legend className="text-sm font-medium">{t("admin.customFields.targetTrackers")}</legend>
        {trackers.map((tracker) => (
          <label key={tracker.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="trackerIds"
              value={tracker.id}
              defaultChecked={field?.trackerIds.includes(tracker.id)}
            />
            {tracker.name}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-1" hidden={!ROLE_VISIBILITY_TYPES.includes(customizedType)}>
        <legend className="text-sm font-medium">{t("admin.customFields.visibility")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="visible" value="1" defaultChecked={field?.visible ?? true} />
          {t("admin.customFields.visibleAll")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="visible" value="0" defaultChecked={field ? !field.visible : false} />
          {t("admin.customFields.visibleRoles")}
        </label>
        <div className="flex flex-col gap-1 pl-6">
          {roles.map((role) => (
            <label key={role.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="roleIds" value={role.id} defaultChecked={field?.roleIds.includes(role.id)} />
              {role.name}
            </label>
          ))}
          <input type="hidden" name="roleIds" value="" />
        </div>
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? t("issue.saving") : field ? t("admin.users.saveChanges") : t("admin.customFields.add")}
      </button>
    </form>
  );
}

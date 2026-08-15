"use client";

import { useActionState } from "react";
import { updateProjectSettingsAction, type UpdateProjectSettingsActionState } from "@/interface/actions/project-actions";
import type { CustomField } from "@/domain/custom-field/entity";
import type { Project } from "@/domain/project/entity";
import type { Tracker } from "@/domain/tracker/entity";
import { MODULE_OPTIONS } from "../../module-options";

const initialState: UpdateProjectSettingsActionState = { error: null };

function CustomFieldInput({ field, defaultValue }: { field: CustomField; defaultValue: string | null }) {
  const name = `customField_${field.id}`;
  const id = `customField-${field.id}`;

  switch (field.fieldFormat) {
    case "text":
      return <textarea id={id} name={name} defaultValue={defaultValue ?? ""} className="border rounded px-3 py-2" />;
    case "int":
      return <input id={id} name={name} type="number" step={1} defaultValue={defaultValue ?? ""} className="border rounded px-3 py-2" />;
    case "float":
      return <input id={id} name={name} type="number" step="any" defaultValue={defaultValue ?? ""} className="border rounded px-3 py-2" />;
    case "date":
      return <input id={id} name={name} type="date" defaultValue={defaultValue ?? ""} className="border rounded px-3 py-2" />;
    case "bool":
      return (
        <select id={id} name={name} defaultValue={defaultValue ?? ""} className="border rounded px-3 py-2">
          <option value="">(未設定)</option>
          <option value="1">はい</option>
          <option value="0">いいえ</option>
        </select>
      );
    case "list":
      return (
        <select id={id} name={name} defaultValue={defaultValue ?? ""} className="border rounded px-3 py-2">
          <option value="">(未設定)</option>
          {field.possibleValues.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      );
    case "string":
    default:
      return <input id={id} name={name} type="text" defaultValue={defaultValue ?? ""} className="border rounded px-3 py-2" />;
  }
}

export function ProjectSettingsForm({
  project,
  trackers,
  customFields,
  customValueByFieldId,
}: {
  project: Project;
  trackers: Tracker[];
  customFields: CustomField[];
  customValueByFieldId: Record<string, string | null>;
}) {
  const [state, formAction, pending] = useActionState(updateProjectSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <input type="hidden" name="projectIdentifier" value={project.identifier} />
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          名称
        </label>
        <input id="name" name="name" required defaultValue={project.name} className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium">
          概要
        </label>
        <textarea id="description" name="description" defaultValue={project.description} className="border rounded px-3 py-2" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublic" defaultChecked={project.isPublic} />
        公開プロジェクト
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">モジュール</legend>
        {MODULE_OPTIONS.map((module) => (
          <label key={module.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabledModules" value={module.key} defaultChecked={project.enabledModules.includes(module.key)} />
            {module.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">トラッカー</legend>
        {trackers.map((tracker) => (
          <label key={tracker.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="trackerIds" value={tracker.id} defaultChecked={project.trackerIds.includes(tracker.id)} />
            {tracker.name}
          </label>
        ))}
      </fieldset>
      {customFields.length > 0 ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">カスタムフィールド</legend>
          {customFields.map((field) => (
            <div key={field.id} className="flex flex-col gap-1">
              <input type="hidden" name="customFieldIds" value={field.id} />
              <label htmlFor={`customField-${field.id}`} className="text-sm font-medium">
                {field.name}
                {field.isRequired ? <span className="text-red-600"> *</span> : null}
              </label>
              <CustomFieldInput field={field} defaultValue={customValueByFieldId[field.id] ?? null} />
            </div>
          ))}
        </fieldset>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "保存中…" : "保存"}
      </button>
    </form>
  );
}

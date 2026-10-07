"use client";

import type { CustomField } from "@/domain/custom-field/entity";

/**
 * Inputs for TimeEntry custom fields. Field names are `cf_<customFieldId>`, which
 * time-entry-actions.ts collects back into the rawValues map — the same convention the
 * REST API uses for `custom_fields`.
 */
export function CustomFieldInputs({
  fields,
  values,
}: {
  fields: CustomField[];
  values?: Record<string, string | null>;
}) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <>
      {fields.map((field) => {
        const name = `cf_${field.id}`;
        const current = values?.[field.id] ?? field.defaultValue ?? "";
        return (
          <div key={field.id} className="flex flex-col gap-1">
            <label htmlFor={name} className="text-sm font-medium">
              {field.name}
              {field.isRequired ? <span className="text-red-600"> *</span> : null}
            </label>
            {field.fieldFormat === "text" ? (
              <textarea id={name} name={name} rows={3} defaultValue={current} className="border rounded px-3 py-2" />
            ) : field.fieldFormat === "list" ? (
              <select id={name} name={name} defaultValue={current} className="border rounded px-3 py-2">
                <option value="">(未設定)</option>
                {field.possibleValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            ) : field.fieldFormat === "bool" ? (
              <select id={name} name={name} defaultValue={current} className="border rounded px-3 py-2">
                <option value="">(未設定)</option>
                <option value="1">はい</option>
                <option value="0">いいえ</option>
              </select>
            ) : (
              <input
                id={name}
                name={name}
                type={field.fieldFormat === "date" ? "date" : field.fieldFormat === "int" || field.fieldFormat === "float" ? "number" : "text"}
                step={field.fieldFormat === "float" ? "any" : undefined}
                defaultValue={current}
                className="border rounded px-3 py-2"
              />
            )}
          </div>
        );
      })}
    </>
  );
}

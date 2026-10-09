"use client";

import { CUSTOM_VALUE_SEPARATOR } from "@/domain/custom-value/separator";
import type { CustomField } from "@/domain/custom-field/entity";
import type { Locale } from "@/domain/i18n/locales";
import { translate } from "@/domain/i18n/messages";

/**
 * Inputs for TimeEntry custom fields. Field names are `cf_<customFieldId>`, which
 * time-entry-actions.ts collects back into the rawValues map — the same convention the
 * REST API uses for `custom_fields`.
 */
export function CustomFieldInputs({
  fields,
  values,
  locale = "ja",
}: {
  fields: CustomField[];
  values?: Record<string, string | null>;
  locale?: Locale;
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
              <textarea id={name} name={name} rows={3} required={field.isRequired} defaultValue={current} className="border rounded px-3 py-2" />
            ) : field.fieldFormat === "list" && field.multiple ? (
              // Several choices post under one name; submittedCustomValue joins them one per line.
              <select
                id={name}
                name={name}
                multiple
                defaultValue={current.split(CUSTOM_VALUE_SEPARATOR).filter((item) => item !== "")}
                className="border rounded px-3 py-2"
              >
                {field.possibleValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            ) : field.fieldFormat === "list" ? (
              <select id={name} name={name} required={field.isRequired} defaultValue={current} className="border rounded px-3 py-2">
                <option value="">{translate(locale, "issue.unset")}</option>
                {field.possibleValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            ) : field.fieldFormat === "bool" ? (
              <select id={name} name={name} required={field.isRequired} defaultValue={current} className="border rounded px-3 py-2">
                <option value="">{translate(locale, "issue.unset")}</option>
                <option value="1">{translate(locale, "query.yes")}</option>
                <option value="0">{translate(locale, "query.no")}</option>
              </select>
            ) : (
              <input
                id={name}
                name={name}
                type={field.fieldFormat === "date" ? "date" : field.fieldFormat === "int" || field.fieldFormat === "float" ? "number" : "text"}
                step={field.fieldFormat === "float" ? "any" : undefined}
                required={field.isRequired}
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

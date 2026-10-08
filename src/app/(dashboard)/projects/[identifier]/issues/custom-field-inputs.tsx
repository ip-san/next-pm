"use client";

import type { CustomField } from "@/domain/custom-field/entity";
import type { ChoiceOption } from "@/domain/custom-field/choices";

/**
 * Per-format input widgets for issue custom fields, shared by the create and edit forms —
 * the equivalent of Redmine's `issues/_form_custom_fields` + `custom_field_tag`. The format
 * mapping follows Redmine::FieldFormat: bool renders as a three-state dropdown rather than a
 * checkbox, both because an unchecked checkbox submits nothing and because Redmine's own
 * default bool edit style is a dropdown with an empty choice for "not set".
 *
 * Values are raw strings throughout; the server is the only place they get format-checked
 * (`domain/custom-field/coerce.ts`), so a hand-crafted submission can't slip past by
 * bypassing these widgets.
 */
export function CustomFieldInputs({
  fields,
  values,
  errors,
  onChange,
  idPrefix,
  choices = {},
}: {
  fields: CustomField[];
  values: Record<string, string>;
  errors?: Record<string, string>;
  onChange: (customFieldId: string, value: string) => void;
  idPrefix: string;
  /** The options for each user / version field, from customFieldChoiceOptions. */
  choices?: Record<string, ChoiceOption[]>;
}) {
  if (fields.length === 0) return null;

  return (
    <>
      {fields.map((field) => {
        const inputId = `${idPrefix}-cf-${field.id}`;
        const value = values[field.id] ?? "";
        const error = errors?.[field.id];
        return (
          <div key={field.id} className="flex flex-col gap-1">
            <label htmlFor={inputId} className="text-sm font-medium">
              {field.name}
              {field.isRequired ? <span className="text-red-600"> *</span> : null}
            </label>
            {renderInput(field, inputId, value, onChange, choices[field.id] ?? [])}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        );
      })}
    </>
  );
}

function renderInput(
  field: CustomField,
  inputId: string,
  value: string,
  onChange: (customFieldId: string, value: string) => void,
  choices: ChoiceOption[],
) {
  const className = "border rounded px-3 py-2";
  const common = {
    id: inputId,
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(field.id, event.target.value),
    className,
  };

  switch (field.fieldFormat) {
    case "text":
      return <textarea {...common} rows={4} />;
    case "int":
      return <input {...common} type="number" step="1" />;
    case "float":
      return <input {...common} type="number" step="any" />;
    case "date":
      return <input {...common} type="date" />;
    case "bool":
      return (
        <select {...common}>
          <option value="">(未設定)</option>
          <option value="1">はい</option>
          <option value="0">いいえ</option>
        </select>
      );
    case "list":
      return (
        <select {...common}>
          <option value="">(未設定)</option>
          {field.possibleValues.map((possibleValue) => (
            <option key={possibleValue} value={possibleValue}>
              {possibleValue}
            </option>
          ))}
        </select>
      );
    case "string":
    case "link":
      return <input {...common} type="text" />;
    case "user":
    case "version":
    case "enumeration":
      return (
        <select {...common} className={className}>
          <option value="">(未設定)</option>
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      );
  }
}

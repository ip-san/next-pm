"use client";

import type { CustomField } from "@/domain/custom-field/entity";

/** One custom field value input, by its format: shared by the project and version forms (names `customField_<id>`). */
export function CustomFieldValueInput({ field, defaultValue }: { field: CustomField; defaultValue: string | null }) {
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
    case "link":
    default:
      return <input id={id} name={name} type="text" defaultValue={defaultValue ?? ""} className="border rounded px-3 py-2" />;
  }
}

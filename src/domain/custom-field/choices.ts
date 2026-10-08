import type { CustomField } from "./entity";

export interface ChoiceOption {
  value: string;
  label: string;
}

/**
 * The options each `user` / `version` field offers in a form: the project's members for a user
 * field and its shared versions for a version field. Other formats have no entry here. This is
 * the client-side mirror of the server's option sets (application/custom-field/option-sets.ts),
 * so a form only offers what the server will accept.
 */
export function customFieldChoiceOptions(
  fields: Pick<CustomField, "id" | "fieldFormat">[],
  choices: { users: ChoiceOption[]; versions: ChoiceOption[] },
): Record<string, ChoiceOption[]> {
  const options: Record<string, ChoiceOption[]> = {};
  for (const field of fields) {
    if (field.fieldFormat === "user") options[field.id] = choices.users;
    if (field.fieldFormat === "version") options[field.id] = choices.versions;
  }
  return options;
}

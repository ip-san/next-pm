/**
 * Reduced from Redmine's full Redmine::FieldFormat registry (lib/redmine/field_format.rb)
 * to the formats that don't require a relational lookup target (EnumerationFormat,
 * UserFormat, VersionFormat, AttachmentFormat are out of scope for this phase).
 */
export type CustomFieldFormat = "string" | "text" | "int" | "float" | "date" | "bool" | "list";

export interface CustomField {
  id: string;
  name: string;
  fieldFormat: CustomFieldFormat;
  isRequired: boolean;
  defaultValue: string | null;
  /** Only meaningful when fieldFormat is "list". */
  possibleValues: string[];
  position: number;
  trackerIds: string[];
}

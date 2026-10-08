/**
 * Reduced from Redmine's full Redmine::FieldFormat registry (lib/redmine/field_format.rb)
 * to the formats that don't require a relational lookup target (EnumerationFormat,
 * UserFormat, VersionFormat, AttachmentFormat are out of scope for this phase).
 */
export type CustomFieldFormat = "string" | "text" | "int" | "float" | "date" | "bool" | "list" | "link";

/**
 * The model a custom field applies to — mirrors Redmine's CustomField STI subclasses
 * (IssueCustomField, ProjectCustomField, TimeEntryCustomField, ...) reduced to the three
 * implemented so far.
 */
export type CustomizedType = "Issue" | "Project" | "TimeEntry";

export interface CustomField {
  id: string;
  name: string;
  customizedType: CustomizedType;
  fieldFormat: CustomFieldFormat;
  isRequired: boolean;
  defaultValue: string | null;
  /** Only meaningful when fieldFormat is "list". */
  possibleValues: string[];
  position: number;
  /** Only meaningful when customizedType is "Issue" — Project/TimeEntry custom fields apply globally. */
  trackerIds: string[];
}

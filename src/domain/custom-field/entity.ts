/**
 * Reduced from Redmine's full Redmine::FieldFormat registry (lib/redmine/field_format.rb)
 * to the formats that don't require a relational lookup target (EnumerationFormat,
 * UserFormat, VersionFormat, AttachmentFormat are out of scope for this phase).
 */
export type CustomFieldFormat = "string" | "text" | "int" | "float" | "date" | "bool" | "list" | "link" | "user" | "version" | "enumeration";

/** One choice of an `enumeration` field (Redmine's CustomFieldEnumeration). */
export interface CustomFieldEnumeration {
  id: string;
  name: string;
  position: number;
  active: boolean;
}

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
  /** The choices of an `enumeration` field, active or not; empty for every other format. */
  enumerations?: CustomFieldEnumeration[];
}

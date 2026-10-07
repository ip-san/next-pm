import type { Positioned } from "@/domain/ordering/positioned";
import type { CustomField, CustomizedType } from "./entity";

export interface CustomFieldRepository {
  listAll(): Promise<CustomField[]>;
  listForTracker(trackerId: string): Promise<CustomField[]>;
  /** Fields applicable to a customizedType with no tracker concept (e.g. all Project custom fields). */
  listForCustomizedType(customizedType: CustomizedType): Promise<CustomField[]>;
  findById(id: string): Promise<CustomField | null>;
  create(field: Omit<CustomField, "id">): Promise<CustomField>;
}

/**
 * Admin-screen writes — see IssueStatusAdminRepository for why these sit apart.
 *
 * `fieldFormat` and `customizedType` are deliberately absent from `update`: Redmine's
 * CustomField#field_format= silently ignores the assignment on a persisted record ("cannot
 * change format of a saved custom field"), and customizedType is the STI class, which never
 * changes either.
 */
export interface CustomFieldAdminRepository {
  update(
    id: string,
    changes: Pick<CustomField, "name" | "isRequired" | "defaultValue" | "possibleValues" | "trackerIds">,
  ): Promise<CustomField>;
  /** Takes the field's custom_values with it, like Redmine's `has_many :custom_values, dependent: :delete_all`. */
  delete(id: string): Promise<void>;
  updatePositions(positions: Positioned[]): Promise<void>;
}

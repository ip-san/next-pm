import type { CustomField, CustomizedType } from "./entity";

export interface CustomFieldRepository {
  listAll(): Promise<CustomField[]>;
  listForTracker(trackerId: string): Promise<CustomField[]>;
  /** Fields applicable to a customizedType with no tracker concept (e.g. all Project custom fields). */
  listForCustomizedType(customizedType: CustomizedType): Promise<CustomField[]>;
  findById(id: string): Promise<CustomField | null>;
  create(field: Omit<CustomField, "id">): Promise<CustomField>;
}

import type { CustomField } from "./entity";

export interface CustomFieldRepository {
  listForTracker(trackerId: string): Promise<CustomField[]>;
  findById(id: string): Promise<CustomField | null>;
  create(field: Omit<CustomField, "id">): Promise<CustomField>;
}

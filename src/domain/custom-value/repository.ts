import type { CustomizedType } from "@/domain/custom-field/entity";
import type { CustomValue } from "./entity";

export interface CustomValueRepository {
  listForCustomized(customizedType: CustomizedType, customizedId: string): Promise<CustomValue[]>;
  /** Upserts one row per (customFieldId, customizedId) — this phase doesn't support multi-value fields. */
  set(customFieldId: string, customizedType: CustomizedType, customizedId: string, value: string | null): Promise<CustomValue>;
  /**
   * Drops every value attached to one record. `custom_values` is polymorphic, so there is no
   * foreign key to cascade from — whoever deletes the owning record has to clear its values
   * explicitly or they stay in the table forever.
   */
  deleteForCustomized(customizedType: CustomizedType, customizedId: string): Promise<void>;
}

import type { CustomizedType } from "@/domain/custom-field/entity";
import type { CustomValue } from "./entity";

export interface CustomValueRepository {
  listForCustomized(customizedType: CustomizedType, customizedId: string): Promise<CustomValue[]>;
  /** Upserts one row per (customFieldId, customizedId) — this phase doesn't support multi-value fields. */
  set(customFieldId: string, customizedType: CustomizedType, customizedId: string, value: string | null): Promise<CustomValue>;
}

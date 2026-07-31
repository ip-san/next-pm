import type { CustomValue } from "./entity";

export interface CustomValueRepository {
  listForCustomized(customizedType: "Issue", customizedId: string): Promise<CustomValue[]>;
  /** Upserts one row per (customFieldId, customizedId) — this phase doesn't support multi-value fields. */
  set(customFieldId: string, customizedType: "Issue", customizedId: string, value: string | null): Promise<CustomValue>;
}

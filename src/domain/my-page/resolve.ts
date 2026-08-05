import { DEFAULT_MY_PAGE_LAYOUT, DEFAULT_TIMELOG_DAYS, MAX_TIMELOG_DAYS, MIN_TIMELOG_DAYS } from "./entity";
import type { MyPagePreferences } from "./repository";

/** Falls back to the default layout/no settings when the user has never saved a My Page layout before. */
export function resolveMyPagePreferences(stored: MyPagePreferences | null): MyPagePreferences {
  return stored ?? { layout: DEFAULT_MY_PAGE_LAYOUT, blockSettings: {} };
}

/** Clamped the same way Redmine clamps its timelog block's `days` setting. */
export function resolveTimelogDays(blockSettings: Record<string, Record<string, unknown>>): number {
  const raw = blockSettings.timelog?.days;
  const days = typeof raw === "number" ? raw : DEFAULT_TIMELOG_DAYS;
  return Math.min(MAX_TIMELOG_DAYS, Math.max(MIN_TIMELOG_DAYS, Math.trunc(days)));
}

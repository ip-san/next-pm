import type { MyPageLayout } from "./entity";

export interface MyPagePreferences {
  layout: MyPageLayout;
  /** Keyed by block type — e.g. `{ timelog: { days: 14 } }`. Mirrors Redmine's my_page_settings. */
  blockSettings: Record<string, Record<string, unknown>>;
}

export interface MyPageRepository {
  find(userId: string): Promise<MyPagePreferences | null>;
  save(userId: string, preferences: MyPagePreferences): Promise<void>;
}

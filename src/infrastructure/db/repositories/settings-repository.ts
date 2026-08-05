import { db } from "@/infrastructure/db/client";
import { settings } from "@/infrastructure/db/schema/settings";
import type { SettingsRepository } from "@/domain/settings/repository";

export class DrizzleSettingsRepository implements SettingsRepository {
  async getAll(): Promise<Record<string, string>> {
    const rows = await db.select().from(settings);
    return Object.fromEntries(rows.map((row) => [row.name, row.value]));
  }

  async setMany(values: Record<string, string>): Promise<void> {
    for (const [name, value] of Object.entries(values)) {
      await db
        .insert(settings)
        .values({ name, value })
        .onConflictDoUpdate({ target: settings.name, set: { value } });
    }
  }
}

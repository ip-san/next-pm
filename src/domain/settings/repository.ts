/**
 * Mirrors Redmine's Setting model at the storage layer: a flat name/value store with defaults
 * living in code (here, alongside each feature's settings module) rather than in the DB — see
 * commit-keywords.ts for the first consumer. Deliberately simpler than Setting: no serialized/
 * format/security_notifications catalog, since next-pm has no need yet for the full settings.yml
 * surface Redmine ships (hundreds of keys spanning mail, auth, display, etc).
 */
export interface SettingsRepository {
  getAll(): Promise<Record<string, string>>;
  setMany(values: Record<string, string>): Promise<void>;
}

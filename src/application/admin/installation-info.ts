import type { MessageKey } from "@/domain/i18n/messages";

/**
 * What Redmine's Administration > Information page reports (AdminController#info): a checklist of
 * things an operator must have right, then the environment. The facts are gathered by the caller,
 * so this stays free of file-system, database and process access.
 */
export interface InstallationFacts {
  /** Whether the default `admin` account still has its default password (Redmine's default_admin_account_changed?). */
  defaultAdminPasswordInUse: boolean;
  /** Whether the attachment storage directory can be written to. */
  storageWritable: boolean;
  /** Journal entries minus the migrations recorded in the database; anything above zero is pending. */
  pendingMigrations: number;
}

export interface InstallationChecklistItem {
  /** A catalog key; the admin information page renders it in the viewer's locale. */
  labelKey: MessageKey;
  ok: boolean;
}

/** Each check mirrors one entry of AdminController#info, with the same wording where next-pm has an equivalent. */
export function buildInstallationChecklist(facts: InstallationFacts): InstallationChecklistItem[] {
  return [
    { labelKey: "admin.check.defaultAdminPassword", ok: !facts.defaultAdminPasswordInUse },
    { labelKey: "admin.check.storageWritable", ok: facts.storageWritable },
    { labelKey: "admin.check.migrations", ok: facts.pendingMigrations === 0 },
  ];
}

export interface EnvironmentFacts {
  appVersion: string;
  nextVersion: string;
  runtime: string;
  databaseVersion: string;
  /** Output of `git --version` and friends, or null when the tool is not installed. */
  scmVersions: { name: string; version: string | null }[];
}

/** The environment block, one line per fact, in the order Redmine::Info.environment lists them. */
export function formatEnvironment(facts: EnvironmentFacts): string {
  const lines = [
    `Environment: ${process.env.NODE_ENV ?? "unknown"}`,
    `next-pm version: ${facts.appVersion}`,
    `Next.js version: ${facts.nextVersion}`,
    `Runtime: ${facts.runtime}`,
    `Database: PostgreSQL ${facts.databaseVersion}`,
    ...facts.scmVersions.map((scm) => `${scm.name}: ${scm.version ?? "not installed"}`),
  ];
  return lines.join("\n");
}

import { encodeCsv } from "@/domain/csv/encode";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

/** The columns Redmine's users CSV exports by default (UserQuery#default_columns_names), minus last_login_on, which next-pm doesn't record. */
export function usersCsvHeader(locale: Locale): string[] {
  return (
    [
      "export.users.login",
      "export.users.firstname",
      "export.users.lastname",
      "export.users.mail",
      "export.users.admin",
      "export.users.status",
      "export.users.createdOn",
    ] as const
  ).map((key) => translate(locale, key));
}

/** The header in Japanese, the language the export used before it followed the viewer's. */
export const USERS_CSV_HEADER = usersCsvHeader("ja");

/** The same labels the admin user list shows. */
const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  active: "export.users.statusActive",
  registered: "export.users.statusRegistered",
  locked: "export.users.statusLocked",
};

export interface UsersCsvRecord {
  login: string;
  firstname: string;
  lastname: string;
  mail: string;
  isAdmin: boolean;
  status: string;
  createdAt: Date;
}

/** Redmine's booleans print as localized yes/no. Timestamps are UTC, to the second. */
export function usersCsvBody(records: UsersCsvRecord[], locale: Locale = "ja"): string {
  const rows = records.map((record) => [
    record.login,
    record.firstname,
    record.lastname,
    record.mail,
    translate(locale, record.isAdmin ? "export.yes" : "export.no"),
    STATUS_LABEL_KEYS[record.status] ? translate(locale, STATUS_LABEL_KEYS[record.status]) : record.status,
    record.createdAt.toISOString().replace("T", " ").slice(0, 19),
  ]);
  return encodeCsv([usersCsvHeader(locale), ...rows]);
}

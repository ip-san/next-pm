import { encodeCsv } from "@/domain/csv/encode";

/** The columns Redmine's users CSV exports by default (UserQuery#default_columns_names), minus last_login_on, which next-pm doesn't record. */
export const USERS_CSV_HEADER = ["ログインID", "名", "姓", "メール", "管理者", "状態", "作成日時"];

/** The same labels the admin user list shows. */
const STATUS_LABEL: Record<string, string> = {
  active: "有効",
  registered: "登録済",
  locked: "ロック中",
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
export function usersCsvBody(records: UsersCsvRecord[]): string {
  const rows = records.map((record) => [
    record.login,
    record.firstname,
    record.lastname,
    record.mail,
    record.isAdmin ? "はい" : "いいえ",
    STATUS_LABEL[record.status] ?? record.status,
    record.createdAt.toISOString().replace("T", " ").slice(0, 19),
  ]);
  return encodeCsv([USERS_CSV_HEADER, ...rows]);
}

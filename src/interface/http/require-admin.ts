import { currentUserFromCookies } from "./current-user";

/** Shared by every server action gated to site admins only (mirrors Redmine's `require_admin`). */
export async function requireAdmin(): Promise<string | null> {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    return "この操作を行う権限がありません。";
  }
  return null;
}

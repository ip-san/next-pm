import Link from "next/link";
import { redirect } from "next/navigation";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { logoutAction } from "@/interface/actions/auth-actions";
import { currentUserFromCookies } from "@/interface/http/current-user";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUserFromCookies();

  // Redmine's check_if_login_required: with Setting.login_required on, an anonymous visitor
  // never reaches a page at all. resolve-actor.ts enforces the same rule for the data paths
  // (Route Handlers, Server Actions); this is what turns it into a redirect instead of an
  // empty page.
  if (!user) {
    const { loginRequired } = await loadAuthSettings(new DrizzleSettingsRepository());
    if (loginRequired) {
      redirect("/login");
    }
  }

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b px-4 py-2 flex items-center justify-between text-sm">
        <nav className="flex items-center gap-4">
          <Link href="/my" className="font-semibold">
            next-pm
          </Link>
          <Link href="/projects" className="hover:underline">
            プロジェクト
          </Link>
          <Link href="/search" className="hover:underline">
            検索
          </Link>
          {user?.isAdmin ? (
            <Link href="/admin" className="hover:underline">
              管理
            </Link>
          ) : null}
        </nav>
        {user ? (
          <div className="flex items-center gap-3">
            <Link href="/my/account" className="hover:underline">
              {user.firstname} {user.lastname}
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="hover:underline">
                ログアウト
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login" className="hover:underline">
            ログイン
          </Link>
        )}
      </header>
      <div className="flex flex-col flex-1">{children}</div>
    </div>
  );
}

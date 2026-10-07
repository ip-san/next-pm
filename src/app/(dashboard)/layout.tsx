import Link from "next/link";
import { logoutAction } from "@/interface/actions/auth-actions";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { listProjectsWithPermission } from "@/interface/http/resolve-actor";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUserFromCookies();

  // Redmine's application_menu hides the global Issues and Spent time entries unless the
  // viewer holds the permission in at least one visible project with the module enabled
  // (`allowed_to?(..., nil, :global => true) && EnabledModule.exists?`). `can` already
  // folds the module check in, so one lookup per permission answers both halves.
  const [issueProjects, timeProjects] = await Promise.all([
    listProjectsWithPermission(user, "view_issues"),
    listProjectsWithPermission(user, "view_time_entries"),
  ]);

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
          {/* `view_project` is public in Redmine, so the activity entry has no `:if` guard. */}
          <Link href="/activity" className="hover:underline">
            活動
          </Link>
          {issueProjects.length > 0 ? (
            <Link href="/issues" className="hover:underline">
              チケット
            </Link>
          ) : null}
          {timeProjects.length > 0 ? (
            <Link href="/time_entries" className="hover:underline">
              作業時間
            </Link>
          ) : null}
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

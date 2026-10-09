import Link from "next/link";
import { redirect } from "next/navigation";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { logoutAction } from "@/interface/actions/auth-actions";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { currentLocale } from "@/interface/http/locale";
import { listProjectsWithPermission } from "@/interface/http/resolve-actor";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUserFromCookies();
  const locale = await currentLocale();
  const t = (key: MessageKey) => translate(locale, key);

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
            {t("nav.projects")}
          </Link>
          {/* `view_project` is public in Redmine, so the activity entry has no `:if` guard. */}
          <Link href="/activity" className="hover:underline">
            {t("nav.activity")}
          </Link>
          {issueProjects.length > 0 ? (
            <Link href="/issues" className="hover:underline">
              {t("nav.issues")}
            </Link>
          ) : null}
          {timeProjects.length > 0 ? (
            <Link href="/time_entries" className="hover:underline">
              {t("nav.timeEntries")}
            </Link>
          ) : null}
          <Link href="/news" className="hover:underline">
            {t("nav.news")}
          </Link>
          <Link href="/search" className="hover:underline">
            {t("nav.search")}
          </Link>
          {user?.isAdmin ? (
            <Link href="/admin" className="hover:underline">
              {t("nav.admin")}
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
                {t("nav.logout")}
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login" className="hover:underline">
            {t("nav.login")}
          </Link>
        )}
      </header>
      <div className="flex flex-col flex-1">{children}</div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { deleteIssueStatusAction, reorderIssueStatusAction } from "@/interface/actions/admin-issue-status-actions";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { AdminRowControls } from "../admin-row-controls";
import { IssueStatusForm } from "./issue-status-form";

// Always needs a live DB read with no per-request caching benefit — opt out of static
// prerendering so `next build` doesn't try to reach Postgres at build time.
export const dynamic = "force-dynamic";

export default async function IssueStatusesPage() {
  const locale = await currentLocale();
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const statuses = await new DrizzleIssueStatusRepository().listAll();

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{translate(locale, "admin.issueStatuses.title")}</h1>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">{translate(locale, "admin.trackers.name")}</th>
            <th className="pr-4 py-1">{translate(locale, "admin.issueStatuses.closed")}</th>
            <th className="pr-4 py-1">{translate(locale, "admin.issueStatuses.defaultDoneRatio")}</th>
            <th className="pr-4 py-1" />
          </tr>
        </thead>
        <tbody>
          {statuses.map((status) => (
            <tr key={status.id} className="border-b">
              <td className="pr-4 py-1">{status.name}</td>
              <td className="pr-4 py-1">{status.isClosed ? translate(locale, "issue.yes") : "—"}</td>
              <td className="pr-4 py-1">{status.defaultDoneRatio === null ? "—" : `${status.defaultDoneRatio}%`}</td>
              <td className="pr-4 py-1">
                <AdminRowControls locale={locale}
                  id={status.id}
                  idField="statusId"
                  editHref={`/admin/issue-statuses/${status.id}`}
                  reorderAction={reorderIssueStatusAction}
                  deleteAction={deleteIssueStatusAction}
                  deleteConfirm={interpolate(translate(locale, "admin.issueStatuses.deleteConfirm"), { name: status.name })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <IssueStatusForm locale={locale} />
    </main>
  );
}

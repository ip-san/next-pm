import { notFound } from "next/navigation";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { deleteIssueStatusAction, reorderIssueStatusAction } from "@/interface/actions/admin-issue-status-actions";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { AdminRowControls } from "../admin-row-controls";
import { IssueStatusForm } from "./issue-status-form";

// Always needs a live DB read with no per-request caching benefit — opt out of static
// prerendering so `next build` doesn't try to reach Postgres at build time.
export const dynamic = "force-dynamic";

export default async function IssueStatusesPage() {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const statuses = await new DrizzleIssueStatusRepository().listAll();

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">チケットステータス</h1>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">名称</th>
            <th className="pr-4 py-1">完了</th>
            <th className="pr-4 py-1">既定の進捗率</th>
            <th className="pr-4 py-1" />
          </tr>
        </thead>
        <tbody>
          {statuses.map((status) => (
            <tr key={status.id} className="border-b">
              <td className="pr-4 py-1">{status.name}</td>
              <td className="pr-4 py-1">{status.isClosed ? "はい" : "—"}</td>
              <td className="pr-4 py-1">{status.defaultDoneRatio === null ? "—" : `${status.defaultDoneRatio}%`}</td>
              <td className="pr-4 py-1">
                <AdminRowControls
                  id={status.id}
                  idField="statusId"
                  editHref={`/admin/issue-statuses/${status.id}`}
                  reorderAction={reorderIssueStatusAction}
                  deleteAction={deleteIssueStatusAction}
                  deleteConfirm={`ステータス「${status.name}」を削除しますか?`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <IssueStatusForm />
    </main>
  );
}

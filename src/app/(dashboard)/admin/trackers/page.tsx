import { notFound } from "next/navigation";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { deleteTrackerAction, reorderTrackerAction } from "@/interface/actions/admin-tracker-actions";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { AdminRowControls } from "../admin-row-controls";
import { TrackerForm } from "./tracker-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

export default async function TrackersPage() {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const [trackers, statuses] = await Promise.all([
    new DrizzleTrackerRepository().listAll(),
    new DrizzleIssueStatusRepository().listAll(),
  ]);
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">トラッカー</h1>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">名称</th>
            <th className="pr-4 py-1">既定のステータス</th>
            <th className="pr-4 py-1">ロードマップ</th>
            <th className="pr-4 py-1" />
          </tr>
        </thead>
        <tbody>
          {trackers.map((tracker) => (
            <tr key={tracker.id} className="border-b">
              <td className="pr-4 py-1">{tracker.name}</td>
              <td className="pr-4 py-1">{statusById.get(tracker.defaultStatusId)?.name ?? "?"}</td>
              <td className="pr-4 py-1">{tracker.isInRoadmap ? "表示" : "—"}</td>
              <td className="pr-4 py-1">
                <AdminRowControls
                  id={tracker.id}
                  idField="trackerId"
                  editHref={`/admin/trackers/${tracker.id}`}
                  reorderAction={reorderTrackerAction}
                  deleteAction={deleteTrackerAction}
                  deleteConfirm={`トラッカー「${tracker.name}」を削除しますか?`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <TrackerForm statuses={statuses} trackers={trackers} />
    </main>
  );
}

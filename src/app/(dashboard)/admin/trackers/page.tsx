import { notFound } from "next/navigation";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { deleteTrackerAction, reorderTrackerAction } from "@/interface/actions/admin-tracker-actions";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { AdminRowControls } from "../admin-row-controls";
import { TrackerForm } from "./tracker-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

export default async function TrackersPage() {
  const locale = await currentLocale();
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
      <h1 className="text-xl font-semibold">{translate(locale, "admin.trackers")}</h1>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">{translate(locale, "admin.trackers.name")}</th>
            <th className="pr-4 py-1">{translate(locale, "admin.trackers.defaultStatus")}</th>
            <th className="pr-4 py-1">{translate(locale, "admin.trackers.roadmap")}</th>
            <th className="pr-4 py-1" />
          </tr>
        </thead>
        <tbody>
          {trackers.map((tracker) => (
            <tr key={tracker.id} className="border-b">
              <td className="pr-4 py-1">{tracker.name}</td>
              <td className="pr-4 py-1">{statusById.get(tracker.defaultStatusId)?.name ?? "?"}</td>
              <td className="pr-4 py-1">{tracker.isInRoadmap ? translate(locale, "admin.trackers.inRoadmap") : "—"}</td>
              <td className="pr-4 py-1">
                <AdminRowControls locale={locale}
                  id={tracker.id}
                  idField="trackerId"
                  editHref={`/admin/trackers/${tracker.id}`}
                  reorderAction={reorderTrackerAction}
                  deleteAction={deleteTrackerAction}
                  deleteConfirm={interpolate(translate(locale, "admin.trackers.deleteConfirm"), { name: tracker.name })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <TrackerForm locale={locale} statuses={statuses} trackers={trackers} />
    </main>
  );
}

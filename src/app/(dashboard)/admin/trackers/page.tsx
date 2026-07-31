import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { TrackerForm } from "./tracker-form";

export default async function TrackersPage() {
  const [trackers, statuses] = await Promise.all([
    new DrizzleTrackerRepository().listAll(),
    new DrizzleIssueStatusRepository().listAll(),
  ]);
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">トラッカー</h1>
      <ul className="flex flex-col gap-1">
        {trackers.map((tracker) => (
          <li key={tracker.id}>
            {tracker.name} — 既定: {statusById.get(tracker.defaultStatusId)?.name ?? "?"}
          </li>
        ))}
      </ul>
      <TrackerForm statuses={statuses} />
    </main>
  );
}

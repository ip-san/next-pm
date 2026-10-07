import Link from "next/link";
import { notFound } from "next/navigation";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { CopyWorkflowForm } from "../copy-workflow-form";
import { TrackerForm } from "../tracker-form";

export const dynamic = "force-dynamic";

export default async function EditTrackerPage({ params }: { params: Promise<{ trackerId: string }> }) {
  const { trackerId } = await params;
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const trackerRepository = new DrizzleTrackerRepository();
  const [tracker, trackers, statuses] = await Promise.all([
    trackerRepository.findById(trackerId),
    trackerRepository.listAll(),
    new DrizzleIssueStatusRepository().listAll(),
  ]);
  if (!tracker) {
    notFound();
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">トラッカー: {tracker.name}</h1>
      <TrackerForm statuses={statuses} trackers={trackers} tracker={tracker} />
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">ワークフローのコピー</h2>
        <CopyWorkflowForm tracker={tracker} trackers={trackers} />
      </section>
      <Link href="/admin/trackers" className="text-sm text-blue-700 underline">
        一覧へ戻る
      </Link>
    </main>
  );
}

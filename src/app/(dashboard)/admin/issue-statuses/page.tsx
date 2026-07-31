import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { IssueStatusForm } from "./issue-status-form";

// Always needs a live DB read with no per-request caching benefit — opt out of static
// prerendering so `next build` doesn't try to reach Postgres at build time.
export const dynamic = "force-dynamic";

export default async function IssueStatusesPage() {
  const statuses = await new DrizzleIssueStatusRepository().listAll();

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">チケットステータス</h1>
      <ul className="flex flex-col gap-1">
        {statuses.map((status) => (
          <li key={status.id} className="flex gap-2 items-center">
            <span>{status.name}</span>
            {status.isClosed ? <span className="text-xs text-gray-500">(完了)</span> : null}
          </li>
        ))}
      </ul>
      <IssueStatusForm />
    </main>
  );
}

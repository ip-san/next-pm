import { notFound } from "next/navigation";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { WorkflowMatrixForm } from "./workflow-matrix-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<{ trackerId?: string; roleId?: string }>;
}) {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const { trackerId, roleId } = await searchParams;

  const [trackers, roles, statuses] = await Promise.all([
    new DrizzleTrackerRepository().listAll(),
    new DrizzleRoleRepository().listAssignable(),
    new DrizzleIssueStatusRepository().listAll(),
  ]);

  const selectedTracker = trackerId && trackers.some((t) => t.id === trackerId) ? trackerId : null;
  const selectedRole = roleId && roles.some((r) => r.id === roleId) ? roleId : null;

  const existingTransitions =
    selectedTracker && selectedRole
      ? await new DrizzleWorkflowRepository().listForTrackerAndRole(selectedTracker, selectedRole)
      : [];
  const allowedPairs = new Set(existingTransitions.map((t) => `${t.oldStatusId}:${t.newStatusId}`));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">ワークフロー</h1>

      <form method="get" className="flex items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="trackerId" className="font-medium">
            トラッカー
          </label>
          <select id="trackerId" name="trackerId" defaultValue={selectedTracker ?? ""} className="border rounded px-2 py-1">
            <option value="">選択してください</option>
            {trackers.map((tracker) => (
              <option key={tracker.id} value={tracker.id}>
                {tracker.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="roleId" className="font-medium">
            ロール
          </label>
          <select id="roleId" name="roleId" defaultValue={selectedRole ?? ""} className="border rounded px-2 py-1">
            <option value="">選択してください</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="border rounded px-3 py-1">
          表示
        </button>
      </form>

      {selectedTracker && selectedRole ? (
        <WorkflowMatrixForm
          trackerId={selectedTracker}
          roleId={selectedRole}
          statuses={statuses}
          allowedPairs={Array.from(allowedPairs)}
        />
      ) : (
        <p className="text-sm text-gray-500">トラッカーとロールを選択してください。</p>
      )}
    </main>
  );
}

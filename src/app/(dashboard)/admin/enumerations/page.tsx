import { notFound } from "next/navigation";
import type { EnumerationType } from "@/domain/enumeration/entity";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { EnumerationForm } from "./enumeration-form";
import { EnumerationRow } from "./enumeration-row";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

const TYPES: { type: EnumerationType; label: string }[] = [
  { type: "IssuePriority", label: "チケットの優先度" },
  { type: "TimeEntryActivity", label: "作業分類" },
  { type: "DocumentCategory", label: "ドキュメントカテゴリ" },
];

export default async function EnumerationsPage() {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const enumerationRepository = new DrizzleEnumerationRepository();
  const listsByType = await Promise.all(TYPES.map(({ type }) => enumerationRepository.listByType(type)));

  return (
    <main className="p-8 flex flex-col gap-10">
      <h1 className="text-xl font-semibold">値の一覧</h1>
      {TYPES.map(({ type, label }, index) => {
        // Project overrides (project_id set) are edited from the project's own settings, not here —
        // the admin screen is Redmine's `Enumeration.system` scope.
        const systemRows = listsByType[index].filter((enumeration) => enumeration.projectId === null);
        return (
          <section key={type} className="flex flex-col gap-3">
            <h2 className="font-medium">{label}</h2>
            <ul className="flex flex-col">
              {systemRows.map((enumeration) => (
                <EnumerationRow
                  key={enumeration.id}
                  enumeration={enumeration}
                  reassignCandidates={systemRows.filter((candidate) => candidate.id !== enumeration.id)}
                />
              ))}
              {systemRows.length === 0 ? <li className="text-sm text-gray-400">登録されていません。</li> : null}
            </ul>
            <EnumerationForm type={type} />
          </section>
        );
      })}
    </main>
  );
}

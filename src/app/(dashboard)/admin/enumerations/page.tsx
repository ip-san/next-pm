import { notFound } from "next/navigation";
import type { EnumerationType } from "@/domain/enumeration/entity";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { currentLocale } from "@/interface/http/locale";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { EnumerationForm } from "./enumeration-form";
import { EnumerationRow } from "./enumeration-row";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

const TYPES: { type: EnumerationType; labelKey: MessageKey }[] = [
  { type: "IssuePriority", labelKey: "admin.enumerations.priority" },
  { type: "TimeEntryActivity", labelKey: "admin.enumerations.activity" },
  { type: "DocumentCategory", labelKey: "admin.enumerations.documentCategory" },
];

export default async function EnumerationsPage() {
  const locale = await currentLocale();
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const enumerationRepository = new DrizzleEnumerationRepository();
  const listsByType = await Promise.all(TYPES.map(({ type }) => enumerationRepository.listByType(type)));

  return (
    <main className="p-8 flex flex-col gap-10">
      <h1 className="text-xl font-semibold">{translate(locale, "admin.enumerations.title")}</h1>
      {TYPES.map(({ type, labelKey }, index) => {
        // Project overrides (project_id set) are edited from the project's own settings, not here —
        // the admin screen is Redmine's `Enumeration.system` scope.
        const systemRows = listsByType[index].filter((enumeration) => enumeration.projectId === null);
        return (
          <section key={type} className="flex flex-col gap-3">
            <h2 className="font-medium">{translate(locale, labelKey)}</h2>
            <ul className="flex flex-col">
              {systemRows.map((enumeration) => (
                <EnumerationRow locale={locale}
                  key={enumeration.id}
                  enumeration={enumeration}
                  reassignCandidates={systemRows.filter((candidate) => candidate.id !== enumeration.id)}
                />
              ))}
              {systemRows.length === 0 ? <li className="text-sm text-gray-400">{translate(locale, "admin.noneRegistered")}</li> : null}
            </ul>
            <EnumerationForm locale={locale} type={type} />
          </section>
        );
      })}
    </main>
  );
}

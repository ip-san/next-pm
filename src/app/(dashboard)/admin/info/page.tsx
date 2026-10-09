import { notFound } from "next/navigation";
import { buildInstallationChecklist, formatEnvironment } from "@/application/admin/installation-info";
import { currentLocale } from "@/interface/http/locale";
import { translate } from "@/domain/i18n/messages";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { gatherEnvironmentFacts, gatherInstallationFacts } from "@/interface/http/installation-facts";

// Reads the database and the file system on every request, so it is never prerendered.
export const dynamic = "force-dynamic";

/** Redmine's Administration > Information (AdminController#info). */
export default async function AdminInfoPage() {
  const locale = await currentLocale();
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const [checklist, environment] = await Promise.all([
    gatherInstallationFacts().then(buildInstallationChecklist),
    gatherEnvironmentFacts(),
  ]);

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{translate(locale, "admin.info")}</h1>
      <p className="text-sm">
        <strong>next-pm {environment.appVersion}</strong>
      </p>

      <table className="text-sm border-collapse">
        <tbody>
          {checklist.map((item) => (
            <tr key={item.labelKey} className="border-b">
              <td className="pr-6 py-1">{translate(locale, item.labelKey)}</td>
              <td className="py-1">{item.ok ? "OK" : translate(locale, "admin.checkNeeded")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">{translate(locale, "admin.environment")}</h2>
        <pre className="bg-gray-50 border rounded p-3 text-xs overflow-x-auto">{formatEnvironment(environment)}</pre>
      </section>
    </main>
  );
}

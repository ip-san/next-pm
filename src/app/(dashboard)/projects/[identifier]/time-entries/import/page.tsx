import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { visibleCustomFieldsFor } from "@/domain/custom-field/visibility";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { ImportTimeEntriesForm } from "./import-form";

export default async function ImportTimeEntriesPage({ params }: { params: Promise<{ identifier: string }> }) {
  const locale = await currentLocale();
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, roleIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  // TimeEntryImport.authorized? requires both permissions, not just import_time_entries.
  if (
    !can({ permission: "import_time_entries", project: projectContext, actor }) ||
    !can({ permission: "log_time", project: projectContext, actor })
  ) {
    notFound();
  }

  const customFields = visibleCustomFieldsFor(
    await new DrizzleCustomFieldRepository().listForCustomizedType("TimeEntry"),
    customFieldViewerFor(user, roleIds),
  );

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{interpolate(translate(locale, "timeEntries.importTitle"), { project: project.name })}</h1>
        <Link href={`/projects/${identifier}/time-entries`} className="underline text-sm">
          {translate(locale, "timeEntries.spentTimeList")}
        </Link>
      </div>
      <p className="text-sm text-gray-600">
        {translate(locale, "timeEntries.importIntro")}
        <code className="font-mono">spent_on</code>
        {translate(locale, "timeEntries.importSpentOn")}
        <code className="font-mono">hours</code>
        {translate(locale, "timeEntries.importHours")}
        <code className="font-mono">activity</code>
        {translate(locale, "timeEntries.importActivity")}
        <code className="font-mono">user</code>
        {translate(locale, "timeEntries.importUserStart")}
        <code className="font-mono">log_time_for_other_users</code>
        {translate(locale, "timeEntries.importUserEnd")}
        <code className="font-mono">issue_id</code>
        {translate(locale, "timeEntries.importIssueId")}
        <code className="font-mono">comments</code>
        {customFields.length > 0
          ? interpolate(translate(locale, "timeEntries.importCustomFields"), {
              fields: customFields.map((field) => field.name).join(", "),
            })
          : null}
        {translate(locale, "timeEntries.importEnd")}
      </p>
      <ImportTimeEntriesForm projectIdentifier={identifier} locale={locale} />
    </main>
  );
}

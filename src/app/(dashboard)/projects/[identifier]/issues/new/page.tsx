import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { visibleCustomFieldsFor } from "@/domain/custom-field/visibility";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { memberUserIds } from "@/domain/member/entity";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { NewIssueForm } from "./new-issue-form";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";
import { currentLocale } from "@/interface/http/locale";

export default async function NewIssuePage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const locale = await currentLocale();
  const t = (key: MessageKey) => translate(locale, key);
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, roleIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "add_issues", project: projectContext, actor })) {
    notFound();
  }

  const [trackers, priorities, categories, versions, projectMembers, settings] = await Promise.all([
    new DrizzleTrackerRepository().findByIds(project.trackerIds),
    new DrizzleEnumerationRepository().listByType("IssuePriority"),
    new DrizzleIssueCategoryRepository().listByProject(project.id),
    new DrizzleVersionRepository().listSharedWith(project.id),
    new DrizzleMemberRepository().listByProject(project.id),
    new DrizzleSettingsRepository().getAll(),
  ]);
  // Every tracker's fields are sent down once; the form narrows them to the selected tracker,
  // so switching trackers doesn't need a round trip (Redmine reloads the form instead).
  const customFieldsByTracker = await Promise.all(
    project.trackerIds.map((trackerId) => new DrizzleCustomFieldRepository().listForTracker(trackerId)),
  );
  const customFields = [...new Map(customFieldsByTracker.flat().map((field) => [field.id, field])).values()].sort(
    (a, b) => a.position - b.position,
  );
  const members = await new DrizzleUserRepository().findByIds(memberUserIds(projectMembers));
  const projectGroupIds = new Set(projectMembers.flatMap((member) => (member.groupId ? [member.groupId] : [])));
  const groups = (await new DrizzleGroupRepository().listAll()).filter((group) => projectGroupIds.has(group.id));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{interpolate(t("issueForm.title"), { project: project.name })}</h1>
      {trackers.length === 0 ? (
        // Mirrors Redmine's error_no_tracker_in_project — showing an empty tracker <select>
        // let a submit reach the server with trackerId: "" (failing zod's uuid check with no
        // visible error, since the form never rendered one for this field), so the click
        // appeared to silently do nothing.
        <p className="text-sm text-gray-600">{t("issueForm.noTracker")}</p>
      ) : (
        <NewIssueForm
          identifier={identifier}
          projectId={project.id}
          trackers={trackers}
          priorities={priorities}
          members={members}
          groups={groups}
          categories={categories}
          versions={versions}
          customFields={visibleCustomFieldsFor(customFields, customFieldViewerFor(user, roleIds))}
          doneRatioEditable={resolveGeneralSettings(settings).issueDoneRatio === "issue_field"}
          canSetPrivate={
            can({ permission: "set_issues_private", project: projectContext, actor }) ||
            can({ permission: "set_own_issues_private", project: projectContext, actor })
          }
          canManageSubtasks={can({ permission: "manage_subtasks", project: projectContext, actor })}
          locale={locale}
        />
      )}
    </main>
  );
}

import { notFound } from "next/navigation";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { deleteCustomFieldAction, reorderCustomFieldAction } from "@/interface/actions/admin-custom-field-actions";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";
import { AdminRowControls } from "../admin-row-controls";
import { CustomFieldForm } from "./custom-field-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

const FORMAT_LABEL: Record<string, MessageKey> = {
  string: "admin.customFields.format.string",
  text: "admin.customFields.format.text",
  int: "admin.customFields.format.int",
  float: "admin.customFields.format.float",
  date: "admin.customFields.format.date",
  bool: "admin.customFields.format.bool",
  list: "admin.customFields.format.list",
  link: "admin.customFields.format.link",
  user: "admin.customFields.format.user",
  version: "admin.customFields.format.version",
  enumeration: "admin.customFields.format.enumeration",
};

const CUSTOMIZED_TYPE_LABEL: Record<string, MessageKey> = {
  Issue: "admin.customFields.type.Issue",
  Project: "admin.customFields.type.Project",
  TimeEntry: "admin.customFields.type.TimeEntry",
  Version: "admin.customFields.type.Version",
  Group: "admin.customFields.type.Group",
};

export default async function CustomFieldsPage() {
  const locale = await currentLocale();
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const [fields, trackers, roles] = await Promise.all([
    new DrizzleCustomFieldRepository().listAll(),
    new DrizzleTrackerRepository().listAll(),
    new DrizzleRoleRepository().listGivable(),
  ]);
  const trackerById = new Map(trackers.map((t) => [t.id, t]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{translate(locale, "admin.customFields")}</h1>
      <ul className="flex flex-col gap-2 text-sm">
        {fields.map((field) => (
          <li key={field.id} className="border rounded p-3">
            <p className="font-medium">
              {field.name}{" "}
              <span className="text-xs text-gray-500">
                ({translate(locale, CUSTOMIZED_TYPE_LABEL[field.customizedType])} / {translate(locale, FORMAT_LABEL[field.fieldFormat])})
              </span>
              {field.isRequired ? <span className="text-xs text-red-600">{translate(locale, "admin.customFields.requiredBadge")}</span> : null}
            </p>
            {field.customizedType === "Issue" ? (
              <p className="text-xs text-gray-500">
                {translate(locale, "admin.customFields.trackerLabel")}: {field.trackerIds.map((id) => trackerById.get(id)?.name ?? "?").join(", ") || translate(locale, "query.none")}
              </p>
            ) : null}
            {field.fieldFormat === "list" ? (
              <p className="text-xs text-gray-500">{translate(locale, "admin.customFields.choices")}: {field.possibleValues.join(", ")}</p>
            ) : null}
            <div className="mt-2">
              <AdminRowControls locale={locale}
                id={field.id}
                idField="customFieldId"
                editHref={`/admin/custom-fields/${field.id}`}
                reorderAction={reorderCustomFieldAction}
                deleteAction={deleteCustomFieldAction}
                deleteConfirm={interpolate(translate(locale, "admin.customFields.deleteConfirm"), { name: field.name })}
              />
            </div>
          </li>
        ))}
        {fields.length === 0 ? <li className="text-gray-400">{translate(locale, "admin.noneRegistered")}</li> : null}
      </ul>
      <CustomFieldForm locale={locale} trackers={trackers} roles={roles} />
    </main>
  );
}

import { notFound } from "next/navigation";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { AddUserToGroupForm } from "./add-user-form";
import { GroupCustomFieldsForm } from "./group-custom-fields-form";
import { DeleteGroupButton } from "./delete-group-button";
import { RemoveUserFromGroupButton } from "./remove-user-button";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({ params }: { params: Promise<{ groupId: string }> }) {
  const locale = await currentLocale();
  const { groupId } = await params;
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const groupRepository = new DrizzleGroupRepository();
  const group = await groupRepository.findById(groupId);
  if (!group) {
    notFound();
  }

  const userIds = await groupRepository.listUserIds(groupId);
  const [users, groupFields, groupValues] = await Promise.all([
    new DrizzleUserRepository().findByIds(userIds),
    new DrizzleCustomFieldRepository().listForCustomizedType("Group"),
    new DrizzleCustomValueRepository().listForCustomized("Group", groupId),
  ]);
  const customValueByFieldId = Object.fromEntries(groupValues.map((value) => [value.customFieldId, value.value]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{interpolate(translate(locale, "admin.groups.title"), { name: group.name })}</h1>
        <DeleteGroupButton locale={locale} groupId={group.id} />
      </div>

      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">{translate(locale, "admin.users")}</th>
            <th className="pr-4 py-1" />
          </tr>
        </thead>
        <tbody>
          {users.map((groupUser) => (
            <tr key={groupUser.id} className="border-b">
              <td className="pr-4 py-1">
                {groupUser.login} ({groupUser.lastname} {groupUser.firstname})
              </td>
              <td className="pr-4 py-1">
                <RemoveUserFromGroupButton locale={locale} groupId={group.id} userId={groupUser.id} />
              </td>
            </tr>
          ))}
          {users.length === 0 ? (
            <tr>
              <td colSpan={2} className="text-gray-400 py-2">
                {translate(locale, "admin.groups.noMembers")}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <AddUserToGroupForm locale={locale} groupId={group.id} />
      {groupFields.length > 0 ? (
        <GroupCustomFieldsForm locale={locale} groupId={group.id} customFields={groupFields} customValueByFieldId={customValueByFieldId} />
      ) : null}
    </main>
  );
}

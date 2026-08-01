import { notFound } from "next/navigation";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { AddUserToGroupForm } from "./add-user-form";
import { DeleteGroupButton } from "./delete-group-button";
import { RemoveUserFromGroupButton } from "./remove-user-button";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({ params }: { params: Promise<{ groupId: string }> }) {
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
  const users = await new DrizzleUserRepository().findByIds(userIds);

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">グループ: {group.name}</h1>
        <DeleteGroupButton groupId={group.id} />
      </div>

      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">ユーザー</th>
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
                <RemoveUserFromGroupButton groupId={group.id} userId={groupUser.id} />
              </td>
            </tr>
          ))}
          {users.length === 0 ? (
            <tr>
              <td colSpan={2} className="text-gray-400 py-2">
                メンバーはいません。
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <AddUserToGroupForm groupId={group.id} />
    </main>
  );
}

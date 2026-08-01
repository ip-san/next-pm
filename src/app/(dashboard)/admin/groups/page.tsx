import Link from "next/link";
import { notFound } from "next/navigation";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { GroupForm } from "./group-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const groups = await new DrizzleGroupRepository().listAll();

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">グループ</h1>
        <Link href="/admin/users" className="underline text-sm">
          ユーザー
        </Link>
      </div>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">名前</th>
            <th className="pr-4 py-1" />
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.id} className="border-b">
              <td className="pr-4 py-1">
                <Link href={`/admin/groups/${group.id}`} className="underline">
                  {group.name}
                </Link>
              </td>
            </tr>
          ))}
          {groups.length === 0 ? (
            <tr>
              <td colSpan={2} className="text-gray-400 py-2">
                グループはありません。
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <GroupForm />
    </main>
  );
}

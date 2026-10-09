import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAuthModeOptions } from "@/application/users/load-auth-mode-options";
import { DrizzleLdapAuthSourceRepository } from "@/infrastructure/db/repositories/ldap-auth-source-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { UserForm } from "./user-form";
import { UserRowControls } from "./user-row-controls";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { active: "有効", registered: "登録済", locked: "ロック中" };

export default async function UsersPage() {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const users = await new DrizzleUserRepository().listAll();
  const authModeOptions = await loadAuthModeOptions(new DrizzleLdapAuthSourceRepository(), process.env);

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">ユーザー</h1>
        <div className="flex items-center gap-4 text-sm">
          <a href="/api/admin/users/csv" className="underline">
            CSV
          </a>
          <Link href="/admin/groups" className="underline">
            グループ
          </Link>
        </div>
      </div>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">ログインID</th>
            <th className="pr-4 py-1">氏名</th>
            <th className="pr-4 py-1">メール</th>
            <th className="pr-4 py-1">状態</th>
            <th className="pr-4 py-1">管理者</th>
            <th className="pr-4 py-1" />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="pr-4 py-1">{u.login}</td>
              <td className="pr-4 py-1">
                {u.lastname} {u.firstname}
              </td>
              <td className="pr-4 py-1">{u.mail}</td>
              <td className="pr-4 py-1">{STATUS_LABEL[u.status]}</td>
              <td className="pr-4 py-1">{u.isAdmin ? "○" : ""}</td>
              <td className="pr-4 py-1">
                <UserRowControls user={u} isSelf={u.id === user.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <UserForm authModeOptions={authModeOptions} />
    </main>
  );
}

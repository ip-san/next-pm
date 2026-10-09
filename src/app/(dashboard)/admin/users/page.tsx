import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAuthModeOptions } from "@/application/users/load-auth-mode-options";
import { DrizzleLdapAuthSourceRepository } from "@/infrastructure/db/repositories/ldap-auth-source-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { currentLocale } from "@/interface/http/locale";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { UserForm } from "./user-form";
import { UserRowControls } from "./user-row-controls";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, MessageKey> = {
  active: "admin.statusActive",
  registered: "admin.users.statusRegistered",
  locked: "admin.users.statusLocked",
};

export default async function UsersPage() {
  const locale = await currentLocale();
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const users = await new DrizzleUserRepository().listAll();
  const authModeOptions = await loadAuthModeOptions(new DrizzleLdapAuthSourceRepository(), process.env);

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{translate(locale, "admin.users")}</h1>
        <div className="flex items-center gap-4 text-sm">
          <a href="/api/admin/users/csv" className="underline">
            CSV
          </a>
          <Link href="/admin/groups" className="underline">
            {translate(locale, "admin.groups")}
          </Link>
        </div>
      </div>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">{translate(locale, "login.loginId")}</th>
            <th className="pr-4 py-1">{translate(locale, "admin.users.colName")}</th>
            <th className="pr-4 py-1">{translate(locale, "admin.users.colMail")}</th>
            <th className="pr-4 py-1">{translate(locale, "admin.colStatus")}</th>
            <th className="pr-4 py-1">{translate(locale, "admin.users.colAdmin")}</th>
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
              <td className="pr-4 py-1">{translate(locale, STATUS_LABEL[u.status])}</td>
              <td className="pr-4 py-1">{u.isAdmin ? "○" : ""}</td>
              <td className="pr-4 py-1">
                <UserRowControls locale={locale} user={u} isSelf={u.id === user.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <UserForm locale={locale} authModeOptions={authModeOptions} />
    </main>
  );
}

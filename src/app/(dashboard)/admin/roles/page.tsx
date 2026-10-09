import Link from "next/link";
import { notFound } from "next/navigation";
import { isBuiltinRole } from "@/domain/role/entity";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { deleteRoleAction, reorderRoleAction } from "@/interface/actions/admin-role-actions";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { AdminRowControls } from "../admin-row-controls";
import { CopyRoleForm } from "./copy-role-form";
import { RoleForm } from "./role-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const locale = await currentLocale();
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const roles = await new DrizzleRoleRepository().listAll();

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{translate(locale, "admin.roles.title")}</h1>
        <Link href="/admin/roles/permissions" className="text-sm underline">
          {translate(locale, "admin.roles.editMatrix")}
        </Link>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {roles.map((role) => (
          <li key={role.id} className="border rounded p-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">
                {role.name}
                {isBuiltinRole(role) ? <span className="text-xs text-gray-500">{translate(locale, "admin.roles.builtin")}</span> : null}
              </p>
              <p className="text-xs text-gray-500">{interpolate(translate(locale, "admin.roles.permissionCount"), { count: role.permissions.length })}</p>
            </div>
            {/* A builtin role can be edited but never reordered or deleted (Role#check_deletable). */}
            <AdminRowControls locale={locale}
              id={role.id}
              idField="roleId"
              editHref={`/admin/roles/${role.id}`}
              reorderAction={isBuiltinRole(role) ? undefined : reorderRoleAction}
              deleteAction={isBuiltinRole(role) ? undefined : deleteRoleAction}
              deleteConfirm={interpolate(translate(locale, "admin.roles.deleteConfirm"), { name: role.name })}
            />
          </li>
        ))}
      </ul>
      <CopyRoleForm locale={locale} roles={roles} />
      <RoleForm locale={locale} roles={roles} />
    </main>
  );
}

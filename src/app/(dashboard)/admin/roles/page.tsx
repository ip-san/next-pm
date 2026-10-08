import Link from "next/link";
import { notFound } from "next/navigation";
import { isBuiltinRole } from "@/domain/role/entity";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { deleteRoleAction, reorderRoleAction } from "@/interface/actions/admin-role-actions";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { AdminRowControls } from "../admin-row-controls";
import { CopyRoleForm } from "./copy-role-form";
import { RoleForm } from "./role-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const roles = await new DrizzleRoleRepository().listAll();

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">ロール</h1>
        <Link href="/admin/roles/permissions" className="text-sm underline">
          権限マトリクスを編集
        </Link>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {roles.map((role) => (
          <li key={role.id} className="border rounded p-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">
                {role.name}
                {isBuiltinRole(role) ? <span className="text-xs text-gray-500"> (組み込み)</span> : null}
              </p>
              <p className="text-xs text-gray-500">権限: {role.permissions.length}件</p>
            </div>
            {/* A builtin role can be edited but never reordered or deleted (Role#check_deletable). */}
            <AdminRowControls
              id={role.id}
              idField="roleId"
              editHref={`/admin/roles/${role.id}`}
              reorderAction={isBuiltinRole(role) ? undefined : reorderRoleAction}
              deleteAction={isBuiltinRole(role) ? undefined : deleteRoleAction}
              deleteConfirm={`ロール「${role.name}」を削除しますか?`}
            />
          </li>
        ))}
      </ul>
      <CopyRoleForm roles={roles} />
      <RoleForm roles={roles} />
    </main>
  );
}

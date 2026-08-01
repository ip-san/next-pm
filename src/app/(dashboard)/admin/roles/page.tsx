import Link from "next/link";
import { notFound } from "next/navigation";
import { isMemberRole } from "@/domain/role/entity";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
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
          <li key={role.id} className="border rounded p-3">
            <p className="font-medium">
              {role.name}
              {!isMemberRole(role) ? <span className="text-xs text-gray-500"> (組み込み)</span> : null}
            </p>
            <p className="text-xs text-gray-500">権限: {role.permissions.length}件</p>
          </li>
        ))}
      </ul>
      <RoleForm />
    </main>
  );
}

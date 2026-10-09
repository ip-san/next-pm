import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { isBuiltinRole } from "@/domain/role/entity";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { RoleForm } from "../role-form";

export const dynamic = "force-dynamic";

export default async function EditRolePage({ params }: { params: Promise<{ roleId: string }> }) {
  const locale = await currentLocale();
  const { roleId } = await params;
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const role = await new DrizzleRoleRepository().findById(roleId);
  if (!role) {
    notFound();
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">
        {interpolate(translate(locale, "admin.roles.editTitle"), { name: role.name })}
        {isBuiltinRole(role) ? <span className="text-sm text-gray-500">{translate(locale, "admin.roles.builtin")}</span> : null}
      </h1>
      <RoleForm locale={locale} role={role} />
      <Link href="/admin/roles" className="text-sm text-blue-700 underline">
        {translate(locale, "admin.users.backToList")}
      </Link>
    </main>
  );
}

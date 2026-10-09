import Link from "next/link";
import { notFound } from "next/navigation";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { currentLocale } from "@/interface/http/locale";
import { translate } from "@/domain/i18n/messages";
import { PermissionsMatrixForm } from "./permissions-matrix-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

export default async function RolePermissionsPage() {
  const locale = await currentLocale();
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const roles = await new DrizzleRoleRepository().listAll();

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{translate(locale, "admin.roles.permissions")}</h1>
        <Link href="/admin/roles" className="text-sm underline">
          {translate(locale, "admin.roles.backToList")}
        </Link>
      </div>
      <PermissionsMatrixForm locale={locale} roles={roles} />
    </main>
  );
}

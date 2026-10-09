import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { DrizzleLdapAuthSourceRepository } from "@/infrastructure/db/repositories/ldap-auth-source-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { LdapAuthSourceForm } from "../ldap-auth-source-form";
import { DeleteLdapAuthSourceButton } from "./delete-ldap-auth-source-button";

export const dynamic = "force-dynamic";

export default async function EditLdapAuthSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await currentLocale();
  const { id } = await params;
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }
  const source = await new DrizzleLdapAuthSourceRepository().findById(id);
  if (!source) {
    notFound();
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{interpolate(translate(locale, "admin.ldap.editTitle"), { name: source.name })}</h1>
      <LdapAuthSourceForm locale={locale} source={source} />
      <DeleteLdapAuthSourceButton locale={locale} id={source.id} />
      <Link href="/admin/ldap-auth-sources" className="text-sm underline">
        {translate(locale, "admin.users.backToList")}
      </Link>
    </main>
  );
}

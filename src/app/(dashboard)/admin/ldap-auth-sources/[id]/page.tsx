import Link from "next/link";
import { notFound } from "next/navigation";
import { DrizzleLdapAuthSourceRepository } from "@/infrastructure/db/repositories/ldap-auth-source-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { LdapAuthSourceForm } from "../ldap-auth-source-form";
import { DeleteLdapAuthSourceButton } from "./delete-ldap-auth-source-button";

export const dynamic = "force-dynamic";

export default async function EditLdapAuthSourcePage({ params }: { params: Promise<{ id: string }> }) {
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
      <h1 className="text-xl font-semibold">LDAP認証: {source.name}</h1>
      <LdapAuthSourceForm source={source} />
      <DeleteLdapAuthSourceButton id={source.id} />
      <Link href="/admin/ldap-auth-sources" className="text-sm underline">
        一覧へ戻る
      </Link>
    </main>
  );
}

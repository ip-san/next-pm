import Link from "next/link";
import { notFound } from "next/navigation";
import { DrizzleLdapAuthSourceRepository } from "@/infrastructure/db/repositories/ldap-auth-source-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { LdapAuthSourceForm } from "./ldap-auth-source-form";

export const dynamic = "force-dynamic";

export default async function LdapAuthSourcesPage() {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }
  const sources = await new DrizzleLdapAuthSourceRepository().listAll();

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">LDAP認証</h1>
      <ul className="flex flex-col gap-2 text-sm">
        {sources.map((source) => (
          <li key={source.id} className="border rounded p-3">
            <Link href={`/admin/ldap-auth-sources/${source.id}`} className="underline">
              {source.name}
            </Link>{" "}
            <span className="text-gray-500">
              {source.host}:{source.port}
            </span>
          </li>
        ))}
        {sources.length === 0 ? <li className="text-gray-400">登録されていません。</li> : null}
      </ul>
      <section className="border-t pt-4">
        <h2 className="font-medium text-sm mb-3">認証元を追加</h2>
        <LdapAuthSourceForm />
      </section>
    </main>
  );
}

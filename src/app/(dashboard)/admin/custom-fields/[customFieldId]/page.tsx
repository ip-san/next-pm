import Link from "next/link";
import { notFound } from "next/navigation";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { CustomFieldForm } from "../custom-field-form";

export const dynamic = "force-dynamic";

export default async function EditCustomFieldPage({ params }: { params: Promise<{ customFieldId: string }> }) {
  const { customFieldId } = await params;
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const [field, trackers, roles] = await Promise.all([
    new DrizzleCustomFieldRepository().findById(customFieldId),
    new DrizzleTrackerRepository().listAll(),
    new DrizzleRoleRepository().listGivable(),
  ]);
  if (!field) {
    notFound();
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">カスタムフィールド: {field.name}</h1>
      <CustomFieldForm trackers={trackers} roles={roles} field={field} />
      <Link href="/admin/custom-fields" className="text-sm text-blue-700 underline">
        一覧へ戻る
      </Link>
    </main>
  );
}

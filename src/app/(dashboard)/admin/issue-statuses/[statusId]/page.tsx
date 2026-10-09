import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { IssueStatusForm } from "../issue-status-form";

export const dynamic = "force-dynamic";

export default async function EditIssueStatusPage({ params }: { params: Promise<{ statusId: string }> }) {
  const locale = await currentLocale();
  const { statusId } = await params;
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const status = await new DrizzleIssueStatusRepository().findById(statusId);
  if (!status) {
    notFound();
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{interpolate(translate(locale, "admin.issueStatuses.editTitle"), { name: status.name })}</h1>
      <IssueStatusForm locale={locale} status={status} />
      <Link href="/admin/issue-statuses" className="text-sm text-blue-700 underline">
        {translate(locale, "admin.users.backToList")}
      </Link>
    </main>
  );
}

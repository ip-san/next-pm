import { notFound } from "next/navigation";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { ProjectForm } from "../../new/project-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

export default async function CopyProjectPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const projectRepository = new DrizzleProjectRepository();
  const sourceProject = await projectRepository.findByIdentifier(identifier);
  if (!sourceProject) {
    notFound();
  }

  const [projects, trackers] = await Promise.all([projectRepository.listAll(), new DrizzleTrackerRepository().listAll()]);

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{sourceProject.name} をコピー</h1>
      <p className="text-sm text-gray-600">
        メンバー・チケットカテゴリ・バージョンをコピーします（チケット・Wiki・フォーラム・ドキュメントはコピーされません）。
      </p>
      <ProjectForm projects={projects} trackers={trackers} copyFrom={sourceProject} />
    </main>
  );
}
